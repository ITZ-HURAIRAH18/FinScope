"use client";

import { useEffect, useState } from "react";

interface InlineLoadingProps {
  size?: "sm" | "md" | "lg";
  showTimer?: boolean;
  fullScreen?: boolean;
}

export default function InlineLoading({ 
  size = "md", 
  showTimer = false,
  fullScreen = false 
}: InlineLoadingProps) {
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 60);

    const timerInterval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(timerInterval);
    };
  }, []);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const sizes = {
    sm: { container: "w-32 h-40", text: "text-2xl", timer: "text-xs" },
    md: { container: "w-48 h-60", text: "text-4xl", timer: "text-sm" },
    lg: { container: "w-64 h-80", text: "text-6xl", timer: "text-base" }
  };

  const currentSize = sizes[size];
  const containerClass = fullScreen 
    ? "min-h-screen bg-black flex items-center justify-center relative overflow-hidden"
    : "flex items-center justify-center p-8";

  return (
    <div className={containerClass}>
      {fullScreen && (
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
          <div className="wave wave3"></div>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center space-y-4">
        {/* Water Glass Container */}
        <div className={`relative ${currentSize.container} perspective-1000`}>
          {/* Glass Container */}
          <div className="relative w-full h-full bg-white/5 backdrop-blur-md border-2 border-white/20 rounded-3xl overflow-hidden shadow-2xl">
            {/* Water Fill Animation */}
            <div 
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-600 via-red-500 to-pink-500 transition-all duration-300 ease-out"
              style={{ height: `${progress}%` }}
            >
              {/* Water Surface Ripples */}
              <div className="absolute top-0 left-0 right-0 h-4 overflow-hidden">
                <div className="water-surface"></div>
                <div className="water-surface water-surface-2"></div>
              </div>
              
              {/* Bubbles */}
              <div className="bubble bubble-1"></div>
              <div className="bubble bubble-2"></div>
              <div className="bubble bubble-3"></div>
            </div>

            {/* Progress Percentage */}
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center">
                <div className={`${currentSize.text} font-bold text-white drop-shadow-lg`}>
                  {progress}%
                </div>
                <div className={`text-white/80 ${currentSize.timer} mt-1 font-medium`}>
                  Loading...
                </div>
              </div>
            </div>

            {/* Glass Shine Effect */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"></div>
          </div>

          {/* Timer Display */}
          {showTimer && (
            <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 bg-white/10 backdrop-blur-md border border-red-500/30 rounded-xl px-4 py-2">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-white ${currentSize.timer} font-mono font-semibold`}>
                  {formatTime(seconds)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        /* Water Waves Background */
        .wave {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 200%;
          height: 200px;
          background: linear-gradient(to right, rgba(239, 68, 68, 0.2), rgba(236, 72, 153, 0.2));
          border-radius: 40%;
          animation: wave-animation 8s ease-in-out infinite;
        }

        .wave1 {
          animation-delay: 0s;
          opacity: 0.7;
        }

        .wave2 {
          animation-delay: -2s;
          opacity: 0.5;
        }

        .wave3 {
          animation-delay: -4s;
          opacity: 0.3;
        }

        @keyframes wave-animation {
          0%, 100% {
            transform: translateX(0) translateY(0);
          }
          25% {
            transform: translateX(-25%) translateY(-10px);
          }
          50% {
            transform: translateX(-50%) translateY(0);
          }
          75% {
            transform: translateX(-25%) translateY(10px);
          }
        }

        /* Water Surface Ripples */
        .water-surface {
          position: absolute;
          top: -2px;
          left: -50%;
          width: 200%;
          height: 10px;
          background: linear-gradient(to right, 
            transparent, 
            rgba(255, 255, 255, 0.3) 25%, 
            transparent 50%, 
            rgba(255, 255, 255, 0.3) 75%, 
            transparent
          );
          animation: ripple 3s linear infinite;
        }

        .water-surface-2 {
          animation-delay: -1.5s;
          opacity: 0.5;
        }

        @keyframes ripple {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(50%);
          }
        }

        /* Bubbles */
        .bubble {
          position: absolute;
          bottom: 0;
          width: 12px;
          height: 12px;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.2));
          border-radius: 50%;
          animation: bubble-rise 4s ease-in infinite;
          opacity: 0.6;
        }

        .bubble-1 {
          left: 25%;
          animation-delay: 0s;
          animation-duration: 5s;
        }

        .bubble-2 {
          left: 50%;
          width: 16px;
          height: 16px;
          animation-delay: 1s;
          animation-duration: 6s;
        }

        .bubble-3 {
          left: 75%;
          animation-delay: 2s;
          animation-duration: 5.5s;
        }

        @keyframes bubble-rise {
          0% {
            bottom: 0;
            opacity: 0;
            transform: translateX(0) scale(1);
          }
          10% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            bottom: 100%;
            opacity: 0;
            transform: translateX(15px) scale(0.5);
          }
        }

        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
    </div>
  );
}
