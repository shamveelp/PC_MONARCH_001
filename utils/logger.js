import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf((info) => {
      const splat = info[Symbol.for('splat')];
      const splatStr = splat ? splat.map(s => {
        if (s instanceof Error) {
          return s.stack || s.message;
        }
        return typeof s === 'object' ? JSON.stringify(s) : s;
      }).join(' ') : '';
      return `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message} ${splatStr}`.trim();
    })
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export default logger;
