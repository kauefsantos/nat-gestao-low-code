export type CalendarEventKind = "content" | "delivery" | "production" | "purchase";
export type CalendarEventStatus = "planned" | "done" | "cancelled";

export type CalendarEvent = {
  id: string;
  eventDate: string;
  eventTime: string | null;
  kind: CalendarEventKind;
  title: string;
  details: string | null;
  channel: string | null;
  objective: string | null;
  status: CalendarEventStatus;
  source: "manual" | "editorial_seed";
};

export const calendarKindLabel: Record<CalendarEventKind,string> = {
  content: "Conteúdo",
  delivery: "Entrega",
  production: "Produção",
  purchase: "Compra",
};

export function calendarEventDateLabel(value:string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR",{ weekday:"long",day:"2-digit",month:"long" }).format(date);
}

export function calendarEventShortDate(value:string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR",{ day:"2-digit",month:"2-digit" }).format(date);
}
