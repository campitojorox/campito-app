export default {
  plugins: {
    'postcss-preset-env': {
      stage: 2,
      features: {
        'nesting-rules': true,
        'custom-media-queries': true
      },
      autoprefixer: {
        flexbox: 'no-2009'
      }
    }
  }
};

