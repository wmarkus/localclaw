import type { Api, Model } from "@mariozechner/pi-ai";

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  return model;
}
