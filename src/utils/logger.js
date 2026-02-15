const chalk = require('chalk');

const symbols = {
  success: '✓',
  error: '✗',
  info: '›',
  warning: '⚠',
  progress: '◐'
};

const colors = {
  success: chalk.green,
  error: chalk.red,
  info: chalk.blue,
  warning: chalk.yellow,
  progress: chalk.cyan,
  muted: chalk.gray,
  bold: chalk.bold
};

function success(message) {
  console.log(`${colors.success(symbols.success)} ${message}`);
}

function error(message) {
  console.error(`${colors.error(symbols.error)} ${message}`);
}

function info(message) {
  console.log(`${colors.info(symbols.info)} ${message}`);
}

function warning(message) {
  console.log(`${colors.warning(symbols.warning)} ${message}`);
}

function progress(message) {
  console.log(`${colors.progress(symbols.progress)} ${message}`);
}

function header(message) {
  console.log(`\n${colors.bold(message)}\n`);
}

function dim(message) {
  console.log(colors.muted(message));
}

module.exports = {
  success,
  error,
  info,
  warning,
  progress,
  header,
  dim,
  colors,
  symbols
};
