from __future__ import annotations

import argparse
import json
import sqlite3
import time
from collections import defaultdict
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "5"


def normalize_relative_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("./").lstrip("/")


def normalize_search_text(text: str) -> str:
    return " ".join(text.lower().split())


def parse_string_array(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [normalize_relative_path(item) for item in json.loads(raw_value)]

def infer_subject(tag_counts: dict[str, int], question_count: int) -> tuple[str, str]:
    rules = [
        ("醫學一", "一階", ["解剖學", "生理學", "生物化學", "組織學", "胚胎學"]),
        ("醫學二", "一階", ["藥理學", "病理學", "微生物學", "免疫學", "公共衛生學", "寄生蟲學"]),
        (
            "醫學三",
            "二階",
            ["內科", "感染科", "心臟內科", "消化內科", "腎臟內科", "胸腔內科", "血液腫瘤科", "內分泌新陳代謝科", "風濕免疫科"],
        ),
        ("醫學四", "二階", ["小兒科", "精神科", "神經內科", "皮膚科", "家庭醫學科"]),
        ("醫學五", "二階", ["外科", "骨科學", "泌尿科", "急診醫學", "整形外科", "神經外科", "消化外科", "胸腔外科"]),
        ("醫學六", "二階", ["婦產科", "麻醉科", "耳鼻喉科", "眼科", "復健科", "放射科"]),
    ]

    best_subject = "未分類"
    best_stage = "一階" if question_count >= 100 else "二階"
    best_score = 0

    for subject, stage, keywords in rules:
        score = sum(
            count
            for tag, count in tag_counts.items()
            if any(keyword in tag for keyword in keywords)
        )
        if score > best_score:
            best_score = score
            best_subject = subject
            best_stage = stage

    return best_subject, best_stage


def extract_option_search_text(options: list[Any]) -> str:
    chunks: list[str] = []
    for option in options:
        if isinstance(option, dict):
            label = option.get("label", "")
            text = option.get("text", "")
            if isinstance(label, str) and label.strip():
                chunks.append(label.strip())
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
        elif isinstance(option, str) and option.strip():
            chunks.append(option.strip())
    return " ".join(chunks)


def infer_is_multiple_choice(raw: dict[str, Any], question_text: str, tags: list[str]) -> bool:
    explicit_type = raw.get("question_type")
    if isinstance(explicit_type, str) and explicit_type.strip().lower() in {
        "multiple_choice",
        "multiple_select",
        "multi_select",
        "multiple-answer",
    }:
        return True

    explicit_flag = raw.get("is_multiple_choice")
    if isinstance(explicit_flag, bool):
        return explicit_flag

    combined_text = " ".join([question_text, " ".join(tags)]).lower()
    return any(token in combined_text for token in ["複選", "可複選", "multiple select"])


def build_clean_db(source_db: Path, output_db: Path) -> None:
    source_db = source_db.resolve()
    output_db = output_db.resolve()
    output_db.parent.mkdir(parents=True, exist_ok=True)
    temp_db = output_db.with_suffix(".tmp")
    if temp_db.exists():
        temp_db.unlink()
    if output_db.exists():
        output_db.unlink()

    source_conn = sqlite3.connect(source_db)
    source_conn.row_factory = sqlite3.Row
    target_conn = sqlite3.connect(temp_db)

    try:
        target_conn.executescript(
            """
            PRAGMA journal_mode = DELETE;
            PRAGMA synchronous = OFF;
            PRAGMA temp_store = MEMORY;

            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE exams (
              exam_id TEXT PRIMARY KEY,
              exam_year INTEGER,
              roc_year INTEGER,
              exam_nth_time INTEGER,
              question_count INTEGER NOT NULL,
              image_count INTEGER NOT NULL,
              inferred_subject TEXT NOT NULL,
              inferred_stage TEXT NOT NULL,
              display_title TEXT NOT NULL,
              subtitle TEXT NOT NULL,
              tags_json TEXT NOT NULL,
              search_text TEXT NOT NULL
            );

            CREATE TABLE questions (
              id TEXT PRIMARY KEY,
              exam_id TEXT NOT NULL,
              question_number INTEGER NOT NULL,
              question_text TEXT NOT NULL,
              options_json TEXT NOT NULL,
              correct_answers_json TEXT NOT NULL,
              question_images_json TEXT NOT NULL,
              tags_json TEXT NOT NULL,
              is_multiple_choice INTEGER NOT NULL
            );
            """
        )

        exam_accumulators: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "exam_year": None,
                "exam_nth_time": None,
                "question_count": 0,
                "image_count": 0,
                "tag_counts": defaultdict(int),
                "search_chunks": [],
            }
        )

        insert_question_sql = """
            INSERT INTO questions (
              id, exam_id, question_number, question_text, options_json,
              correct_answers_json, question_images_json, tags_json, is_multiple_choice
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        rows = source_conn.execute(
            """
            SELECT
              id,
              question_text,
              question_images,
              options,
              raw_json
            FROM questions
            """
        )

        question_count = 0
        with target_conn:
            for row in rows:
                raw = json.loads(row["raw_json"])
                exam_id = raw["exam_id"]
                answers = raw.get("answers") or []
                tags = [
                    tag["name"].strip()
                    for tag in (raw.get("tags") or [])
                    if isinstance(tag, dict) and isinstance(tag.get("name"), str) and tag["name"].strip()
                ]
                options = json.loads(row["options"]) if row["options"] else (raw.get("choices") or [])
                question_images = parse_string_array(row["question_images"])
                question_text = (row["question_text"] or raw.get("question") or "").strip()
                option_search_text = extract_option_search_text(options)
                is_multiple_choice = infer_is_multiple_choice(raw, question_text, tags)

                target_conn.execute(
                    insert_question_sql,
                    (
                        row["id"],
                        exam_id,
                        raw.get("original_question_number") or 0,
                        question_text,
                        json.dumps(options, ensure_ascii=False),
                        json.dumps(answers, ensure_ascii=False),
                        json.dumps(question_images, ensure_ascii=False),
                        json.dumps(tags, ensure_ascii=False),
                        1 if is_multiple_choice else 0,
                    ),
                )

                accumulator = exam_accumulators[exam_id]
                accumulator["exam_year"] = accumulator["exam_year"] or raw.get("exam_year")
                accumulator["exam_nth_time"] = accumulator["exam_nth_time"] or raw.get("exam_nth_time")
                accumulator["question_count"] += 1
                accumulator["image_count"] += len(question_images)
                for tag in tags:
                    accumulator["tag_counts"][tag] += 1
                if question_text:
                    accumulator["search_chunks"].append(question_text)
                if option_search_text:
                    accumulator["search_chunks"].append(option_search_text)
                if tags:
                    accumulator["search_chunks"].append(" ".join(tags))

                question_count += 1

        insert_exam_sql = """
            INSERT INTO exams (
              exam_id, exam_year, roc_year, exam_nth_time, question_count, image_count,
              inferred_subject, inferred_stage, display_title, subtitle, tags_json, search_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        with target_conn:
            for exam_id, accumulator in exam_accumulators.items():
                sorted_tags = [
                    name
                    for name, _ in sorted(
                        accumulator["tag_counts"].items(),
                        key=lambda item: (-item[1], item[0]),
                    )
                ]
                inferred_subject, inferred_stage = infer_subject(
                    dict(accumulator["tag_counts"]),
                    accumulator["question_count"],
                )
                roc_year = (
                    accumulator["exam_year"] - 1911
                    if accumulator["exam_year"] is not None
                    else None
                )
                if roc_year is not None and accumulator["exam_nth_time"] is not None:
                    display_title = f"民國 {roc_year} 年第 {accumulator['exam_nth_time']} 次 {inferred_subject}"
                else:
                    display_title = inferred_subject
                subtitle = (
                    f"{inferred_stage} | {accumulator['question_count']} 題 | "
                    f"{' / '.join(sorted_tags[:5]) if sorted_tags else '未整理標籤'}"
                )
                search_text = normalize_search_text(
                    " ".join(
                        [
                            display_title,
                            subtitle,
                            inferred_subject,
                            inferred_stage,
                            " ".join(sorted_tags),
                            " ".join(accumulator["search_chunks"]),
                        ]
                    )
                )

                target_conn.execute(
                    insert_exam_sql,
                    (
                        exam_id,
                        accumulator["exam_year"],
                        roc_year,
                        accumulator["exam_nth_time"],
                        accumulator["question_count"],
                        accumulator["image_count"],
                        inferred_subject,
                        inferred_stage,
                        display_title,
                        subtitle,
                        json.dumps(sorted_tags, ensure_ascii=False),
                        search_text,
                    ),
                )

            target_conn.executemany(
                "INSERT INTO metadata (key, value) VALUES (?, ?)",
                [
                    ("schema_version", SCHEMA_VERSION),
                    ("exam_count", str(len(exam_accumulators))),
                    ("question_count", str(question_count)),
                    ("source_mtime", str(int(source_db.stat().st_mtime))),
                    ("source_path", str(source_db)),
                    ("generated_at", str(int(time.time()))),
                ],
            )

        target_conn.executescript(
            """
            CREATE INDEX idx_questions_exam_number ON questions (exam_id, question_number);
            ANALYZE;
            VACUUM;
            """
        )
        target_conn.close()
        source_conn.close()
        temp_db.replace(output_db)
    finally:
        try:
            source_conn.close()
        except Exception:
            pass
        try:
            target_conn.close()
        except Exception:
            pass
        if temp_db.exists():
            temp_db.unlink(missing_ok=True)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Build a clean MOEX runtime database.")
    parser.add_argument(
        "--source",
        type=Path,
        default=root / "database" / "cougarbot_exams.sqlite",
        help="Path to the raw source SQLite database.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "database" / "moex_clean.sqlite",
        help="Path to the generated clean SQLite database.",
    )
    args = parser.parse_args()

    print(f"[build_clean_db] source: {args.source}")
    print(f"[build_clean_db] output: {args.output}")
    started_at = time.time()
    build_clean_db(args.source, args.output)
    elapsed = time.time() - started_at
    print(f"[build_clean_db] done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
