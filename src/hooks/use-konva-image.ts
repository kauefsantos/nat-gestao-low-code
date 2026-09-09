import { useState, useEffect, useRef } from "react";

type CrossOrigin = "anonymous" | "use-credentials" | "";

export default function useImage(
  url: string,
  crossOrigin?: CrossOrigin
): [HTMLImageElement | undefined, "loading" | "loaded" | "failed"] {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(undefined);
      setStatus("failed");
      return;
    }

    const img = new window.Image();
    imageRef.current = img;

    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }

    img.onload = () => {
      setImage(img);
      setStatus("loaded");
    };

    img.onerror = () => {
      setImage(undefined);
      setStatus("failed");
    };

    img.src = url;

    return () => {
      img.onload = null;
      img.onerror = null;
      imageRef.current = null;
    };
  }, [url, crossOrigin]);

  return [image, status];
}
