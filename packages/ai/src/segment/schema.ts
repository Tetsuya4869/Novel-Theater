/**
 * シーン分割の JSON Schema（§7.2）。
 * Structured Outputs の制約に従い additionalProperties:false / 数値制約なし。
 */
export const SCENE_SEGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          source_start: { type: "integer", description: "正規化後本文の開始文字オフセット" },
          source_end: { type: "integer", description: "正規化後本文の終了文字オフセット" },
          summary: { type: "string", description: "alt テキスト/視覚的要約" },
          setting: {
            type: "object",
            additionalProperties: false,
            properties: {
              place: { type: "string" },
              time_of_day: { type: "string" },
              weather: { type: "string" },
            },
            required: ["place", "time_of_day", "weather"],
          },
          characters_present: { type: "array", items: { type: "string" } },
          key_action: { type: "string" },
          mood: { type: "string" },
          shot_suggestion: { type: "string" },
          panel_priority: { type: "integer", description: "1-5" },
          video_candidate: { type: "boolean" },
        },
        required: [
          "index",
          "source_start",
          "source_end",
          "summary",
          "setting",
          "characters_present",
          "key_action",
          "mood",
          "shot_suggestion",
          "panel_priority",
          "video_candidate",
        ],
      },
    },
  },
  required: ["scenes"],
} as const;
