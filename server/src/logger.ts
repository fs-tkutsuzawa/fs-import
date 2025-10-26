import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(
  logsDir,
  `server-${new Date().toISOString().split('T')[0]}.log`
);

function formatLogMessage(
  level: string,
  message: string,
  ...args: any[]
): string {
  const timestamp = new Date().toISOString();
  const formattedArgs = args
    .map((arg) => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    })
    .join(' ');

  return `[${timestamp}] [${level}] ${message} ${formattedArgs}\n`;
}

function writeToFile(message: string) {
  fs.appendFileSync(logFile, message, 'utf8');
}

export const logger = {
  log: (message: string, ...args: any[]) => {
    const formatted = formatLogMessage('INFO', message, ...args);
    console.log(message, ...args);
    writeToFile(formatted);
  },

  error: (message: string, ...args: any[]) => {
    const formatted = formatLogMessage('ERROR', message, ...args);
    console.error(message, ...args);
    writeToFile(formatted);
  },

  warn: (message: string, ...args: any[]) => {
    const formatted = formatLogMessage('WARN', message, ...args);
    console.warn(message, ...args);
    writeToFile(formatted);
  },

  debug: (message: string, ...args: any[]) => {
    const formatted = formatLogMessage('DEBUG', message, ...args);
    console.log(message, ...args);
    writeToFile(formatted);
  },

  getLogFilePath: () => logFile,
};

// Log startup
logger.log(`Logger initialized. Log file: ${logFile}`);
