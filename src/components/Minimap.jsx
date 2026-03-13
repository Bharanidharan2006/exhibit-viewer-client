import React, { useMemo } from "react";

/**
 * Minimap — Small overlay showing nearby visitors as dots.
 * Props:
 * - visitors:      Map or array of {position: {x, z}, name}
 * - playerPos:     {x, z} local player position
 * - visitorCount:  total connected visitors
 * - visible:       boolean
 * - onToggle:      function
 * - galleryBounds: {minX, maxX, minZ, maxZ} optional
 */
export default function Minimap({
  visitors = [],
  playerPos = { x: 0, z: 0 },
  visitorCount = 0,
  visible = true,
  onToggle,
  galleryBounds,
}) {
  const MAP_SIZE = 140;
  const MAP_RANGE = 30; // world units shown in each direction

  // Convert world position to minimap coordinates
  const worldToMap = (wx, wz) => {
    const dx = wx - playerPos.x;
    const dz = wz - playerPos.z;
    const mx = MAP_SIZE / 2 + (dx / MAP_RANGE) * (MAP_SIZE / 2);
    const mz = MAP_SIZE / 2 + (dz / MAP_RANGE) * (MAP_SIZE / 2);
    return {
      x: Math.max(4, Math.min(MAP_SIZE - 4, mx)),
      y: Math.max(4, Math.min(MAP_SIZE - 4, mz)),
    };
  };

  const visitorDots = useMemo(() => {
    return visitors
      .filter((v) => v.position)
      .map((v) => ({
        ...v,
        mapPos: worldToMap(v.position.x, v.position.z),
      }));
  }, [visitors, playerPos.x, playerPos.z]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        left: "2rem",
        zIndex: 80,
        pointerEvents: "auto",
      }}
    >
      {/* Toggle button - always visible */}
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(196, 162, 101, 0.25)",
          color: visible ? "#c4a265" : "rgba(255,255,255,0.4)",
          padding: "0.35rem 0.7rem",
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.55rem",
          letterSpacing: "0.1em",
          cursor: "pointer",
          marginBottom: visible ? "0.5rem" : 0,
          transition: "all 0.2s",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: visible ? "#c4a265" : "rgba(255,255,255,0.3)",
            transition: "background 0.2s",
          }}
        />
        {visitorCount} {visitorCount === 1 ? "visitor" : "visitors"}
      </button>

      {/* Map */}
      {visible && (
        <div
          style={{
            width: MAP_SIZE,
            height: MAP_SIZE,
            background: "rgba(10, 8, 5, 0.75)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(196, 162, 101, 0.2)",
            position: "relative",
            overflow: "hidden",
            animation: "minimapIn 0.25s ease",
          }}
        >
          {/* Grid lines for spatial reference */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(196,162,101,0.06) 1px, transparent 1px),
                linear-gradient(90deg, rgba(196,162,101,0.06) 1px, transparent 1px)
              `,
              backgroundSize: `${MAP_SIZE / 4}px ${MAP_SIZE / 4}px`,
            }}
          />

          {/* Cross-hair at center (local player) */}
          <div
            style={{
              position: "absolute",
              top: MAP_SIZE / 2 - 5,
              left: MAP_SIZE / 2 - 5,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#c4a265",
              boxShadow: "0 0 8px rgba(196, 162, 101, 0.6)",
              zIndex: 2,
            }}
          />

          {/* Visitor dots */}
          {visitorDots.map((v) => (
            <div
              key={v.socketId}
              title={v.name}
              style={{
                position: "absolute",
                top: v.mapPos.y - 3,
                left: v.mapPos.x - 3,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.7)",
                transition: "top 0.15s ease, left 0.15s ease",
                zIndex: 1,
              }}
            />
          ))}

          {/* Label */}
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.45rem",
              letterSpacing: "0.15em",
              color: "rgba(196, 162, 101, 0.5)",
              textTransform: "uppercase",
            }}
          >
            Nearby
          </div>
        </div>
      )}

      <style>{`
        @keyframes minimapIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
