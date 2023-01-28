'use strict'

/**
* logger.js
* 로깅용 모듈
*/

const { SYSTEM_CONFIG } = require('./system_setting.js'); 
const winston = require('winston');
const winstonDaily = require('winston-daily-rotate-file'); // 날짜별로 로그 저장
const { combine, timestamp, printf, label } = winston.format;
 
const logDir = SYSTEM_CONFIG.log_path;  // 로그 저장할 경로
const colorize = winston.format.colorize(); // 로그레벨별로 색상 정의
 
// 기본설정을 사용하면 로그레벨만 색상이 적용되어 출력되는 로그를 재정의하였다.
// Define log format
const logFormat = printf(({ level, message, label, timestamp }) => {
    return `${colorize.colorize(level, `${timestamp} [${level}] [${label ?? 'default'}]`)} : ${message}`;
    // return `${colorize.colorize(level, `[${timestamp}] [${level.toUpperCase()}] ${label ?? 'default'}:`)} ${message}`;
});
 
/**
 * winston 로그 사용을 위한 함수
 * @param path{string}: label
 * @returns {Logger}
 */
const getLogger = (path) => {
    /**
     * Log Level
     * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
     */
    const logger = winston.createLogger({
        format: combine(
            label({ label: path }), // 로그 출력 시 라벨링 설정
            timestamp({
                format: 'YYYY-MM-DD HH:mm:ss',
            }),
            logFormat,
        ),
        transports: [
            // info 레벨 로그를 저장할 파일 설정
            new winston.transports.DailyRotateFile({
                levels: { // 숫자가 낮을 수록 우선순위가 높습니다.
                    error: 0,
                    warn: 1,
                    info: 2,
                    debug: 3,
                },
                level: SYSTEM_CONFIG.develop_mode ? 'debug' : 'info',
                datePattern: 'YYYY-MM-DD',
                dirname: logDir,
                filename: `%DATE%.log`,
                zippedArchive: true,	
                // handleExceptions: true,
                maxFiles: SYSTEM_CONFIG.log_max_files,
                maxSize: SYSTEM_CONFIG.log_max_size,
            }),
            // // error 레벨 로그를 저장할 파일 설정
            // new winstonDaily({
            //     level: 'error',
            //     datePattern: 'YYYY-MM-DD',
            //     dirname: logDir + '/error',  // error.log 파일은 /logs/error 하위에 저장
            //     filename: `%DATE%.error.log`,
            //     maxFiles: 30,
            //     zippedArchive: true,
            // }),
        ],
    });
 
    // Production 환경이 아닌 경우(dev 등) - Console 로그 출력
    if (SYSTEM_CONFIG.develop_mode == true) {
        logger.add(new winston.transports.Console({
            // handleExceptions: true,
            // json: false,
            format: combine(
                label({ label: path }),
                timestamp(),
                logFormat,
                // `${info.level}: ${info.message} JSON.stringify({ ...rest })` 포맷으로 출력
                // winston.format.simple(),  
            ),
            level: 'debug',
        }));
    }
 
    return logger;
};
 
module.exports = getLogger;
