export type ExternalSourceSeed = {
  kind: "TEXT" | "VIDEO";
  label: string;
  link: string;
  cron: string;
};

export const externalSourcesSeeds: ExternalSourceSeed[] = [
  {
    kind: "TEXT",
    label: "Text blog",
    link:
      process.env.EXTERNAL_TEXT_LINK ??
      "https://roliki.ua/s/json_template_s.txt",
    cron: process.env.EXTERNAL_TEXT_CRON ?? "0 2 * * *",
  },
  {
    kind: "VIDEO",
    label: "Video transcripts",
    link:
      process.env.EXTERNAL_VIDEO_LINK ??
      "https://roliki.ua/s/video-transcripts-neil.txt",
    cron: process.env.EXTERNAL_VIDEO_CRON ?? "0 3 * * *",
  },
];
