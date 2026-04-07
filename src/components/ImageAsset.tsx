import { useEffect, useState } from "react";
import { resolveImageAssetUrl } from "../lib/api";

interface ImageAssetProps {
  relativePath: string;
  alt: string;
  className?: string;
}

export function ImageAsset({ relativePath, alt, className }: ImageAssetProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setSrc(null);
    setError(null);

    resolveImageAssetUrl(relativePath)
      .then((assetUrl) => {
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

  return <img className={className} data-relative-path={relativePath} src={src} alt={alt} loading="lazy" />;
}
