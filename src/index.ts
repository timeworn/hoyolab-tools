#!/usr/bin/env node

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config } from "dotenv";
import { checkIn } from "./utils/checkIn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

config({ path: resolve(rootDir, ".env") });

checkIn();
