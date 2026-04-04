import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { resolveImagePath } from "../lib/api";

const imageCache = new Map<string, string>();

interface ImageAssetProps {
  relativePath: string;
  alt: string;
  className?: string;
}

export function ImageAsset({ relativePath, alt, className }: ImageAssetProps) {
  const [src, setSrc] = useState<string | null>(imageCache.get(relativePath) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (imageCache.has(relativePath)) {
      setSrc(imageCache.get(relativePath) ?? null);
      setError(null);
      return () => {
        active = false;
      };
    }

    setSrc(null);
    setError(null);

    resolveImagePath(relativePath)
      .then((absolutePath) => {
        const assetUrl = convertFileSrc(absolutePath);
        imageCache.set(relativePath, assetUrl);
        if (active) {
          setSrc(assetUrl);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "圖片載入失敗");
        }
      });

    return () => {
      active = false;
    };
  }, [relativePath]);

  if (error) {
    return <div className="image-placeholder error">無法載入圖片：{error}</div>;
  }

  if (!src) {
    return <div className="image-placeholder">圖片載入中...</div>;
  }

  return <img className={className} src={src} alt={alt} loading="lazy" />;
}
