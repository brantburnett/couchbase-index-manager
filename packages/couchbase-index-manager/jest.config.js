module.exports = {
    rootDir: 'app',
    setupFilesAfterEnv: [
        "jest-extended/all",
    ],
    transform: {
        '\\.[jt]sx?$': ['babel-jest', { configFile: '../../babel.config.js' }],
    },
};
