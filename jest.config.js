module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  forceExit: true // the in-process queue keeps a setInterval alive
};
