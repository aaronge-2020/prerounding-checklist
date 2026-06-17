"""
Node.js bridge to the Python de-identification pipeline.
Calls the Python script as a subprocess, passing text via stdin and
receiving JSON with entities + redacted text via stdout.

Usage:
    import { deidentifyWithPython } from './python-deid/bridge.js';
    const result = await deidentifyWithPython(someText);
"""

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, "deid_pipeline.py");

function findPython() {
    // Try the venv Python first, then system Python
    const venvPython = join(__dirname, "venv", "Scripts", "python.exe");
    const sysPython = "python";
    // On Unix, use python3
    if (process.platform !== "win32") {
        return "python3";
    }
    // We'll try both and let spawn fail if neither works
    return venvPython;
}

/**
 * De-identify clinical text using the Python Presidio pipeline.
 *
 * @param {string} text - Clinical text to de-identify.
 * @param {object} options
 * @param {boolean} [options.useTransformer=true] - Use Stanford transformer model.
 * @param {string} [options.model="StanfordAIMI/stanford-deidentifier-base"] - HF model ID.
 * @param {number} [options.timeout=120000] - Timeout in ms.
 * @returns {Promise<{text: string, entities: Array, summary: object}>}
 */
export function deidentifyWithPython(text, options = {}) {
    const {
        useTransformer = true,
        model = "StanfordAIMI/stanford-deidentifier-base",
        timeout = 120000,
    } = options;

    return new Promise((resolve, reject) => {
        const args = [
            PYTHON_SCRIPT,
            "--json",
        ];
        if (!useTransformer) {
            args.push("--no-transformer");
        }
        if (model) {
            args.push("--model", model);
        }

        const pythonExe = findPython();
        const proc = spawn(pythonExe, args, {
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`Python de-id timed out after ${timeout}ms`));
        }, timeout);

        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(
                    `Python de-id exited with code ${code}: ${stderr}`,
                ));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                // If stdout isn't JSON, return the text directly
                resolve({ text: stdout.trim(), entities: [], summary: {} });
            }
        });

        proc.on("error", (err) => {
            clearTimeout(timer);
            reject(new Error(
                `Failed to start Python de-id. Is the venv set up?\n` +
                `Run: powershell -File python-deid/setup.ps1\n` +
                `Error: ${err.message}`,
            ));
        });

        // Write text to stdin and close
        proc.stdin.write(text);
        proc.stdin.end();
    });
}

/**
 * Check if the Python de-id pipeline is available.
 * @returns {Promise<boolean>}
 */
export async function isPythonDeidAvailable() {
    try {
        const proc = spawn(findPython(), ["-c",
            "import presidio_analyzer; print('ok')",
        ], { stdio: "pipe" });
        return new Promise((resolve) => {
            proc.on("close", (code) => {
                resolve(code === 0);
            });
            proc.on("error", () => resolve(false));
        });
    } catch {
        return false;
    }
}
