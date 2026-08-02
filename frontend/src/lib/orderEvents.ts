export type ServerSentEvent = {
  event: string;
  data: string;
  id?: string;
};

export type OrderChangeEvent = {
  type: "orders.changed";
  action: string;
  order_id?: number;
  occurred_at: string;
};

export type OrderEventFilter =
  | { kind: "all" }
  | { kind: "kitchen" }
  | { kind: "order"; orderId?: number | null };

export type RealtimeConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";

const kitchenEventActions = new Set([
  "customer_order.submitted",
  "item.status_updated",
  "order.cancelled",
  "order.paid",
  "order.sent_to_kitchen",
  "order.updated",
]);

export function parseServerSentEvents(buffer: string, chunk: string) {
  const messages: ServerSentEvent[] = [];
  let remaining = buffer + chunk;

  while (true) {
    const separator = /\r?\n\r?\n/.exec(remaining);
    if (!separator || separator.index === undefined) break;

    const rawMessage = remaining.slice(0, separator.index);
    remaining = remaining.slice(separator.index + separator[0].length);

    let event = "message";
    let id: string | undefined;
    const data: string[] = [];

    for (const line of rawMessage.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
    }

    if (data.length > 0) {
      messages.push({ event, data: data.join("\n"), id });
    }
  }

  return { messages, buffer: remaining };
}

export function parseOrderChangeEvent(message: Pick<ServerSentEvent, "event" | "data">): OrderChangeEvent | null {
  if (message.event !== "orders.changed") return null;
  try {
    const payload: unknown = JSON.parse(message.data);
    if (!payload || typeof payload !== "object") return null;
    const event = payload as Partial<OrderChangeEvent>;
    if (
      event.type !== "orders.changed"
      || typeof event.action !== "string"
      || typeof event.occurred_at !== "string"
      || (event.order_id !== undefined && (!Number.isInteger(event.order_id) || event.order_id <= 0))
    ) {
      return null;
    }
    return event as OrderChangeEvent;
  } catch {
    return null;
  }
}

export function matchesOrderEventFilter(event: OrderChangeEvent, filter: OrderEventFilter) {
  if (filter.kind === "all") return true;
  if (filter.kind === "kitchen") return kitchenEventActions.has(event.action);
  return !filter.orderId || event.order_id === filter.orderId;
}
