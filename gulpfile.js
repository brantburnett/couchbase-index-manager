const gulp = require('gulp');
const babel = require('gulp-babel');
const plumber = require('gulp-plumber');
const sourcemaps = require('gulp-sourcemaps');
const jasmine = require('gulp-jasmine');
const JasmineConsoleReporter = require('jasmine-console-reporter');
const del = require('del');

// Ensures that stack traces use sourcemaps to refer to original files
require('source-map-support').install();

gulp.task('clean', () => {
    // You can use multiple globbing patterns as you would with `gulp.src`
    return del(['dist']);
});

gulp.task('build', () =>
    gulp.src(['app/**/*.js'])
        .pipe(plumber())
        .pipe(sourcemaps.init())
        .pipe(babel())
        .pipe(sourcemaps.write('.', {sourceRoot: '../app'}))
        .pipe(gulp.dest('dist'))
);

gulp.task('watch', ['build'], () => {
    gulp.watch('app/**/*.js', ['build']);
});

gulp.task('testbuild', () =>
    gulp.src(['app/**/*.js', 'test/**/*.js'], {base: './'})
        .pipe(plumber())
        .pipe(sourcemaps.init())
        .pipe(babel())
        .pipe(sourcemaps.write('.', {sourceRoot: '../'}))
        .pipe(gulp.dest('testbin'))
);

gulp.task('test', ['testbuild'], () =>
    gulp.src('testbin/test/**/*.spec.js')
        .pipe(plumber({
            errorHandler: () => {},
        }))
        .pipe(jasmine({
            reporter: new JasmineConsoleReporter({
                colors: true,
            }),
        }))
);
