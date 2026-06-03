import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

type ImageLightboxProps = {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const prev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : images.length - 1));
    setZoom(1);
  }, [images.length]);

  const next = useCallback(() => {
    setCurrent((c) => (c < images.length - 1 ? c + 1 : 0));
    setZoom(1);
  }, [images.length]);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, prev, next]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-50 rounded-full bg-navy-800/80 p-2 text-gray-600 transition hover:bg-navy-700 hover:text-gray-900"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-navy-800/80 px-4 py-1.5 text-sm font-medium text-gray-600">
        {current + 1} / {images.length}
      </div>

      {/* Previous */}
      {images.length > 1 && (
        <button
          onClick={prev}
          className="absolute left-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-navy-800/80 p-3 text-gray-600 transition hover:bg-navy-700 hover:text-gray-900"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={next}
          className="absolute right-4 top-1/2 z-50 -translate-y-1/2 rounded-full bg-navy-800/80 p-3 text-gray-600 transition hover:bg-navy-700 hover:text-gray-900"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-navy-800/80 px-4 py-2">
        <button
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          className="text-gray-600 transition hover:text-gray-900 disabled:opacity-30"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="min-w-[3rem] text-center text-sm font-medium text-gray-600">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={zoom >= 3}
          className="text-gray-600 transition hover:text-gray-900 disabled:opacity-30"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {/* Image */}
      <div className="flex h-full w-full items-center justify-center overflow-auto p-16">
        <img
          src={images[current]}
          alt={`Image ${current + 1}`}
          className="max-h-full max-w-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />
      </div>

      {/* Click backdrop to close */}
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
