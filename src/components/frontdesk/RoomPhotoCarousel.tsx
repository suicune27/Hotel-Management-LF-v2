import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Building, Image } from 'lucide-react';

interface RoomPhotoCarouselProps {
  images: string[];
  roomNumber: string;
  autoPlayInterval?: number;
}

export function RoomPhotoCarousel({ images, roomNumber, autoPlayInterval = 5000 }: RoomPhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());

  const validImages = images.filter(Boolean);
  const hasMultiple = validImages.length > 1;

  const goTo = useCallback((i: number) => {
    setIndex(((i % validImages.length) + validImages.length) % validImages.length);
  }, [validImages.length]);

  useEffect(() => {
    if (!hasMultiple || autoPlayInterval <= 0) return;
    const id = setInterval(() => goTo(index + 1), autoPlayInterval);
    return () => clearInterval(id);
  }, [hasMultiple, autoPlayInterval, goTo, index]);

  const onLoad = (i: number) => setLoaded(prev => new Set(prev).add(i));

  if (validImages.length === 0) {
    return (
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] bg-gradient-to-br from-surface-100 to-surface-200 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center text-surface-300">
          <Building className="w-16 h-16 mb-3" />
          <p className="text-sm font-medium">Room #{roomNumber}</p>
          <p className="text-xs mt-1">No photos available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] rounded-2xl overflow-hidden group bg-surface-100">
      {validImages.map((url, i) => (
        <div
          key={url}
          className="absolute inset-0 transition-all duration-700 ease-in-out"
          style={{
            opacity: i === index ? 1 : 0,
            transform: `scale(${i === index ? 1 : 1.05})`,
            zIndex: i === index ? 1 : 0,
          }}
        >
          {!loaded.has(i) && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-100">
              <div className="w-8 h-8 border-2 border-surface-300 border-t-surface-500 rounded-full animate-spin" />
            </div>
          )}
          <img
            src={url}
            alt={`Room ${roomNumber} photo ${i + 1}`}
            className="w-full h-full object-cover"
            onLoad={() => onLoad(i)}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
      ))}

      {hasMultiple && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(index - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-surface-700 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-105 cursor-pointer"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goTo(index + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-surface-700 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-105 cursor-pointer"
            aria-label="Next photo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  i === index
                    ? 'w-6 h-1.5 bg-white shadow-sm'
                    : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
                }`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>

          <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-[11px] font-semibold tabular-nums">
            <Image className="w-3 h-3 inline mr-1 -mt-0.5" />
            {index + 1}/{validImages.length}
          </div>
        </>
      )}
    </div>
  );
}
