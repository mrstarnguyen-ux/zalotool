import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background:           '#0D0F12',
          surface:              '#181C22',
          'surface-variant':    '#1E2330',
          primary:              '#0068FF',
          secondary:            '#4D9FFF',
          accent:               '#0068FF',
          error:                '#EF4444',
          warning:              '#F59E0B',
          success:              '#22C55E',
          info:                 '#0068FF',
          'on-background':      '#E8EAF0',
          'on-surface':         '#E8EAF0',
          'on-primary':         '#FFFFFF',
        },
      },
      light: {
        dark: false,
        colors: {
          background:           '#F4F6FA',
          surface:              '#FFFFFF',
          'surface-variant':    '#F0F2F8',
          primary:              '#0068FF',
          secondary:            '#5C6478',
          accent:               '#0068FF',
          error:                '#EF4444',
          warning:              '#F59E0B',
          success:              '#22C55E',
          info:                 '#0068FF',
          'on-background':      '#0E1117',
          'on-surface':         '#0E1117',
          'on-primary':         '#FFFFFF',
        },
      },
    },
  },
  defaults: {
    VBtn:          { variant: 'flat', rounded: 'lg' },
    VTextField:    { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VSelect:       { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VAutocomplete: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VTextarea:     { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VCard:         { rounded: 'lg', variant: 'flat' },
    VChip:         { rounded: 'md', size: 'small' },
    VDialog:       { maxWidth: 600 },
  },
});
