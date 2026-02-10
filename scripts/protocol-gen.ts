import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateApiReference, generateMethodIndex } from "../src/gateway/protocol/rpc-registry.js";
import { ProtocolSchemas } from "../src/gateway/protocol/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function writeJsonSchema() {
  const definitions: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(ProtocolSchemas)) {
    definitions[name] = schema;
  }

  const rootSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://openclaw.ai/protocol.schema.json",
    title: "OpenClaw Gateway Protocol",
    description: "Handshake, request/response, and event frames for the Gateway WebSocket.",
    oneOf: [
      { $ref: "#/definitions/RequestFrame" },
      { $ref: "#/definitions/ResponseFrame" },
      { $ref: "#/definitions/EventFrame" },
    ],
    discriminator: {
      propertyName: "type",
      mapping: {
        req: "#/definitions/RequestFrame",
        res: "#/definitions/ResponseFrame",
        event: "#/definitions/EventFrame",
      },
    },
    definitions,
  };

  const distDir = path.join(repoRoot, "dist");
  await fs.mkdir(distDir, { recursive: true });
  const jsonSchemaPath = path.join(distDir, "protocol.schema.json");
  await fs.writeFile(jsonSchemaPath, JSON.stringify(rootSchema, null, 2));
  console.log(`wrote ${jsonSchemaPath}`);
  return { jsonSchemaPath, schemaString: JSON.stringify(rootSchema) };
}

async function writeApiReference() {
  const docsDir = path.join(repoRoot, "docs", "gateway");
  await fs.mkdir(docsDir, { recursive: true });

  // Markdown reference
  const markdown = generateApiReference();
  const mdPath = path.join(docsDir, "api-reference.md");
  await fs.writeFile(mdPath, markdown);
  console.log(`wrote ${mdPath}`);

  // Machine-readable method index
  const distDir = path.join(repoRoot, "dist");
  await fs.mkdir(distDir, { recursive: true });
  const indexPath = path.join(distDir, "rpc-methods.json");
  await fs.writeFile(indexPath, JSON.stringify(generateMethodIndex(), null, 2));
  console.log(`wrote ${indexPath}`);
}

async function main() {
  await writeJsonSchema();
  await writeApiReference();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
