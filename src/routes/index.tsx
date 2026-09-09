import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useForceLightMode } from "@/hooks/use-theme";
import { Card, CardContent } from "@/components/ui/card";
import { Stage, Layer, Circle, Group, Image as KonvaImage, Transformer } from "react-konva";
import useImage from "@/hooks/use-konva-image";
import landing1Asset from "@/assets/landing-1.jpeg.asset.json";
import landing2Asset from "@/assets/landing-2.jpeg.asset.json";
import landing3Asset from "@/assets/landing-3.jpeg.asset.json";
import landing4Asset from "@/assets/landing-4.jpeg.asset.json";
import landing5Asset from "@/assets/landing-5.jpeg.asset.json";
import landing6Asset from "@/assets/landing-6.jpeg.asset.json";
import landing7Asset from "@/assets/landing-7.jpg.asset.json";
import landing8Asset from "@/assets/landing-8.jpeg.asset.json";
import landing9Asset from "@/assets/landing-9.jpeg.asset.json";
import landing10Asset from "@/assets/landing-10.jpeg.asset.json";
import landing11Asset from "@/assets/landing-11.jpeg.asset.json";
import landing12Asset from "@/assets/landing-12.jpeg.asset.json";
import landing13Asset from "@/assets/landing-13.jpeg.asset.json";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Inspo — Visual Mood Boards" },
      { name: "description", content: "Collect, organize, and share visual inspiration on a spatial canvas." },
    ],
  }),
});

// Images scattered around the edges, leaving the centre clear for the title
const DEMO_IMAGES = [
  { id: "1", url: landing1Asset.url, x: -742, y: -368, width: 260, height: 260 },
  { id: "2", url: landing2Asset.url, x: 78, y: -481, width: 317, height: 461 },
  { id: "3", url: landing3Asset.url, x: -393, y: -600, width: 321, height: 409 },
  { id: "4", url: landing4Asset.url, x: -203, y: 207, width: 333, height: 444 },
  { id: "5", url: landing5Asset.url, x: -678, y: 20, width: 307, height: 307 },
  { id: "6", url: landing6Asset.url, x: 478, y: -350, width: 318, height: 450 },
  { id: "7", url: landing7Asset.url, x: 312, y: 163, width: 233, height: 373 },
  { id: "8", url: landing8Asset.url, x: -1235, y: -659, width: 370, height: 370 },
  { id: "9", url: landing9Asset.url, x: 609, y: -749, width: 314, height: 314 },
  { id: "10", url: landing10Asset.url, x: -937, y: 416, width: 432, height: 432 },
  { id: "11", url: landing11Asset.url, x: 775, y: 434, width: 250, height: 330 },
  { id: "12", url: landing12Asset.url, x: -1263, y: -187, width: 319, height: 473 },
  { id: "13", url: landing13Asset.url, x: 926, y: -158, width: 240, height: 400 },
];

function LandingPage() {
  useForceLightMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>("1");
  const positionsRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const handleItemUpdate = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    positionsRef.current[id] = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  }, []);

  const copyPositions = useCallback(() => {
    const result = DEMO_IMAGES.map((img) => {
      const override = positionsRef.current[img.id];
      return override
        ? { id: img.id, x: override.x, y: override.y, width: override.width, height: override.height }
        : { id: img.id, x: img.x, y: img.y, width: img.width, height: img.height };
    });
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  }, []);
  

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
      setStagePos({ x: width / 2, y: height / 2 });
    });
    ro.observe(container);
    setStagePos({ x: container.clientWidth / 2, y: container.clientHeight / 2 });
    setStageSize({ width: container.clientWidth, height: container.clientHeight });
    return () => ro.disconnect();
  }, []);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.08;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(Math.max(oldScale * Math.pow(scaleBy, direction), 0.8), 2);
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, []);

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage() || e.target.attrs.name === "dot-grid") {
      setSelectedId(null);
    }
  };

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Dev: copy positions */}
      <button
        onClick={copyPositions}
        className="absolute bottom-4 right-4 z-30 rounded bg-black/80 px-3 py-1.5 text-xs text-white hover:bg-black"
      >
        Copy positions
      </button>

      {/* Central card overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
        <Card className="pointer-events-auto border-border/50 bg-card/90 backdrop-blur-md shadow-lg">
          <CardContent className="flex flex-col items-center gap-4 px-12 py-10">
            <h1 className="select-none text-[clamp(2.5rem,8vw,6rem)] font-semibold leading-none tracking-tighter text-foreground/90">
              Inspo
            </h1>
            <p className="select-none text-xl font-medium tracking-tight text-foreground md:text-2xl">
              Your visual thinking space.
            </p>
            <Link
              to="/signup"
              className="mt-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Get Started
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Konva canvas */}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer>
          <LandingDotGrid stagePos={stagePos} stageScale={stageScale} stageSize={stageSize} />
        </Layer>
        <Layer>
          {DEMO_IMAGES.map((img) => (
            <DemoImage
              key={img.id}
              item={img}
              isSelected={selectedId === img.id}
              onSelect={() => setSelectedId(img.id)}
              onUpdate={handleItemUpdate}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

function DemoImage({ item, isSelected, onSelect, onUpdate }: {
  item: typeof DEMO_IMAGES[number];
  isSelected: boolean;
  onSelect: () => void;
  onUpdate?: (id: string, x: number, y: number, width: number, height: number) => void;
}) {
  const [image] = useImage(item.url, "anonymous");
  const [pos, setPos] = useState({ x: item.x, y: item.y });
  const [size, setSize] = useState({ width: item.width, height: item.height });
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, image]);

  if (!image) return null;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image}
        x={pos.x}
        y={pos.y}
        width={size.width}
        height={size.height}
        draggable
        cornerRadius={12}
        shadowColor="rgba(0,0,0,0.12)"
        shadowBlur={12}
        shadowOffsetY={4}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          const newPos = { x: e.target.x(), y: e.target.y() };
          setPos(newPos);
          onUpdate?.(item.id, newPos.x, newPos.y, size.width, size.height);
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          const newPos = { x: node.x(), y: node.y() };
          const newSize = {
            width: Math.max(50, node.width() * scaleX),
            height: Math.max(50, node.height() * scaleY),
          };
          setPos(newPos);
          setSize(newSize);
          onUpdate?.(item.id, newPos.x, newPos.y, newSize.width, newSize.height);
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) return oldBox;
            return newBox;
          }}
          borderStroke="oklch(0.55 0.22 264)"
          anchorStroke="oklch(0.55 0.22 264)"
          anchorFill="#fff"
          anchorSize={8}
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}

function LandingDotGrid({ stagePos, stageScale, stageSize }: { stagePos: { x: number; y: number }; stageScale: number; stageSize: { width: number; height: number } }) {
  const dots = useMemo(() => {
    const spacing = 32;
    const result: { x: number; y: number }[] = [];
    const startX = Math.floor(-stagePos.x / stageScale / spacing) * spacing - spacing;
    const startY = Math.floor(-stagePos.y / stageScale / spacing) * spacing - spacing;
    const endX = startX + (stageSize.width / stageScale) + spacing * 2;
    const endY = startY + (stageSize.height / stageScale) + spacing * 2;
    for (let x = startX; x < endX; x += spacing) {
      for (let y = startY; y < endY; y += spacing) {
        result.push({ x, y });
      }
    }
    return result;
  }, [stagePos.x, stagePos.y, stageScale, stageSize.width, stageSize.height]);

  return (
    <Group name="dot-grid">
      {dots.map((dot, i) => (
        <Circle key={i} x={dot.x} y={dot.y} radius={1} fill="#c0c0c8" listening={false} />
      ))}
    </Group>
  );
}
