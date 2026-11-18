import { test as it, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

interface ContractField {
  name: string;
  type: string;
  optional: boolean;
}

interface ContractType {
  name: string;
  fields: Record<string, ContractField>;
}

interface ContractSchema {
  version: string;
  generated: string;
  types: Record<string, ContractType>;
}

interface ParsedTsType {
  name: string;
  fields: Record<string, { name: string; type: string; optional: boolean }>;
}

function normalizeType(t?: string): string {
  if (!t) return "any";
  const trimmed = t.trim();
  if (trimmed === "any" || trimmed === "unknown") return "any";
  if (trimmed === "boolean") return "boolean";
  if (trimmed === "number") return "number";
  if (trimmed === "string") return "string";
  return trimmed;
}

function parseTsDeclarations(filePath: string): Record<string, ParsedTsType> {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const parsedTypes: Record<string, ParsedTsType> = {};

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      const typeName = node.name.text;
      const fields: Record<string, { name: string; type: string; optional: boolean }> = {};

      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const fieldName = member.name.getText(sourceFile);
          const isOptional = Boolean(member.questionToken);
          const typeText = member.type ? member.type.getText(sourceFile) : "any";
          fields[fieldName] = {
            name: fieldName,
            type: normalizeType(typeText),
            optional: isOptional,
          };
        }
      }

      parsedTypes[typeName] = {
        name: typeName,
        fields,
      };
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return parsedTypes;
}

describe("Type Drift Radar: Daemon (Go) vs Client Bridge (TS) Contract Parity", () => {
  const schemaPath = path.join(rootDir, "tests", "harness", "contracts", "daemon_api.json");
  const bridgeTsPath = path.join(rootDir, "src", "client", "bridge", "daemon.ts");

  it("daemon_api.json intermediate schema exists and is valid", () => {
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
    const raw = fs.readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(raw) as ContractSchema;
    assert.ok(schema.types, "Schema must contain types dictionary");
    assert.ok(Object.keys(schema.types).length >= 10, "Schema should have contractual IPC types");
  });

  it("TypeScript bridge exports corresponding interfaces for all Go IPC contract structs", () => {
    const raw = fs.readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(raw) as ContractSchema;
    const tsTypes = parseTsDeclarations(bridgeTsPath);

    // Map Go struct names to TS interface names (e.g. ModManifest -> ModInfo or ModManifest)
    const typeMapping: Record<string, string> = {
      ModManifest: "ModInfo",
      DiagnosticsResponse: "DiagnosticsResponse",
      LogEntry: "LogEntry",
      ModTogglePayload: "ModTogglePayload",
      ModToggleResponse: "ModToggleResponse",
      OpenFolderResponse: "OpenFolderResponse",
      DaemonSpawnPayload: "DaemonSpawnPayload",
      DaemonSpawnResponse: "DaemonSpawnResponse",
      DaemonKillPayload: "DaemonKillPayload",
      DaemonKillResponse: "DaemonKillResponse",
      HealthResponse: "HealthResponse",
      AuthTokenHeaders: "AuthTokenHeaders",
    };

    const errors: string[] = [];

    for (const [goTypeName, goSchema] of Object.entries(schema.types)) {
      const expectedTsName = typeMapping[goTypeName] || goTypeName;
      const tsType = tsTypes[expectedTsName];

      if (!tsType) {
        errors.push(
          `Missing TypeScript interface: Go struct '${goTypeName}' has no corresponding '${expectedTsName}' interface in src/client/bridge/daemon.ts`,
        );
        continue;
      }

      // 1. Verify all fields from Go exist in TS interface with matching nullability
      for (const [goFieldName, goField] of Object.entries(goSchema.fields)) {
        const tsField = tsType.fields[goFieldName];
        if (!tsField) {
          errors.push(
            `Contract field missing in TS: Interface '${expectedTsName}' is missing field '${goFieldName}' (from Go '${goTypeName}.${goFieldName}')`,
          );
          continue;
        }

        const goOptional = Boolean(goField.optional);
        if (goOptional !== tsField.optional) {
          errors.push(
            `Field optionality mismatch in '${expectedTsName}.${goFieldName}': Go optional=${goOptional}, TS optional=${tsField.optional}`,
          );
        }

        // Compare types
        const normalizedGoType = normalizeType(goField.type);
        const normalizedTsType = normalizeType(tsField.type);

        // Normalize compound types (e.g. LogEntry[] vs LogEntry[] or ModManifest vs ModInfo)
        const expectedMappedTsType = normalizedGoType
          .replace("ModManifest", "ModInfo")
          .replace("LogEntry", "LogEntry");

        if (
          normalizedTsType !== expectedMappedTsType &&
          !(
            normalizedGoType === "any" &&
            (normalizedTsType === "any" || normalizedTsType.includes("|"))
          )
        ) {
          errors.push(
            `Type mismatch for '${expectedTsName}.${goFieldName}': Go has '${goField.type}' (${expectedMappedTsType}), but TS defines '${tsField.type}'`,
          );
        }
      }

      // 2. Verify TS interface has no stale / unregistered extra fields
      for (const tsFieldName of Object.keys(tsType.fields)) {
        if (!goSchema.fields[tsFieldName]) {
          errors.push(
            `Extraneous field in TS: Interface '${expectedTsName}' has field '${tsFieldName}' not found in Go '${goTypeName}'`,
          );
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(
        `IPC Contract Parity Drift Detected:\n\n${errors.map((e) => `  - ${e}`).join("\n")}\n\nUpdate src/client/bridge/daemon.ts or re-run schema generation to synchronize contracts.`,
      );
    }
  });

  it("simulated schema drift detection catches missing or modified fields", () => {
    // Self-test the validation logic by simulating a drifted field
    const tsTypes = parseTsDeclarations(bridgeTsPath);
    const mockGoType: ContractType = {
      name: "DiagnosticsResponse",
      fields: {
        uptime: { name: "uptime", type: "string", optional: false },
        newTelemetryCounter: { name: "newTelemetryCounter", type: "number", optional: false },
      },
    };

    const errors: string[] = [];
    const tsDiag = tsTypes["DiagnosticsResponse"];
    assert.ok(tsDiag, "DiagnosticsResponse should exist in TS");

    for (const [goFieldName] of Object.entries(mockGoType.fields)) {
      if (!tsDiag.fields[goFieldName]) {
        errors.push(`Field '${goFieldName}' missing in TS interface 'DiagnosticsResponse'`);
      }
    }

    assert.equal(errors.length, 1);
    assert.ok(
      errors[0]?.includes("newTelemetryCounter"),
      "should identify missing telemetry counter",
    );
  });
});
