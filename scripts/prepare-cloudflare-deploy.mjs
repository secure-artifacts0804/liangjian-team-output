import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../dist/server/wrangler.json", import.meta.url);
const outputPath = new URL(
  "../dist/server/wrangler.deploy.json",
  import.meta.url,
);

const config = JSON.parse(await readFile(sourcePath, "utf8"));
config.name = "liangjian-team-output";
config.compatibility_date = "2026-08-03";
config.compatibility_flags = ["nodejs_compat"];
config.workers_dev = true;
config.preview_urls = false;
config.base_dir = ".";
config.find_additional_modules = true;
config.observability = { enabled: true, head_sampling_rate: 1 };
config.d1_databases = [
  {
    binding: "DB",
    database_name: "liangjian-team-output-db",
    database_id: "65003997-3f2e-4ac1-973e-8ca74b3ebf42",
  },
];

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
