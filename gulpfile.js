const gulp = require('gulp');
const babel = require('gulp-babel');
const plumber = require('gulp-plumber');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');

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
