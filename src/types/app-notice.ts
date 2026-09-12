export type AppNotice = {
  tone: "saving" | "saved" | "error";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
} | null;
