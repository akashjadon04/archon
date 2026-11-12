import Vue from 'vue'

import './config-check'
import './console-splash'

import './filters'
import './plugins'
import './mixins'
import './components'

import store from './store'
import router from './router'

import { compose } from '@cortezaproject/corteza-js'
import { mixins, corredor, websocket, i18n } from '@cortezaproject/corteza-vue'

const notProduction = (process.env.NODE_ENV !== 'production')
const verboseEventbus = window.location.search.includes('verboseEventbus')

export default (options = {}) => {
  options = {
    el: '#app',
    name: 'compose',
    template: '<router-view />',

    mixins: [
      mixins.corredor,
    ],

    data: () => ({
      loaded: true,
      i18nLoaded: true,
    }),

    async created () {
      this.loaded = true
      this.i18nLoaded = true

      try {
        this.websocket()
      } catch (e) {}

      try {
        if (this.$auth) {
          await this.$auth.vue(this).handle().catch(() => ({}))
        }

        await this.$Settings.init({ api: this.$SystemAPI }).catch(() => ({}))
        const icon = this.$Settings.attachment('ui.iconLogo') || '/icon.svg'
        const favicon = document.getElementById('favicon')
        if (favicon) favicon.href = icon

        const user = this.$auth?.user || { meta: {} }
        if (user?.meta?.preferredLanguage) {
          document.body.setAttribute('dir', this.textDirectionality(user.meta.preferredLanguage))
          this.$i18n.i18next.changeLanguage(user.meta.preferredLanguage)
          this.$ComposeAPI
            ?.setHeader('Accept-Language', user.meta.preferredLanguage)
            ?.setHeader('Content-Language', user.meta.preferredLanguage)
        }

        if (user?.meta?.theme) {
          document.getElementsByTagName('html')[0].setAttribute('data-color-mode', user.meta.theme)
        }

        try { this.$store.dispatch('wfPrompts/update') } catch (e) {}
        try { this.$store.dispatch('rbac/load') } catch (e) {}
        try { this.$store.dispatch('notifications/fetchNotifications') } catch (e) {}
        try {
          this.$store.dispatch('drafts/init', {
            composeAPI: this.$ComposeAPI,
            systemAPI: this.$SystemAPI,
            resourceType: 'compose:record',
          })
        } catch (e) {}
      } catch (err) {
        console.warn('Archon running in standalone dev mode:', err)
      } finally {
        this.loaded = true
        this.i18nLoaded = true
      }
    },

    methods: {
      /**
       * Registers event listener for websocket messages and
       * routes them depending on their type
       */
      websocket () {
        // cross-link auth & websocket so that ws can use the right access token

        websocket.init(this)

        // register event listener for workflow messages
        this.$on('websocket-message', ({ data }) => {
          const msg = JSON.parse(data)
          switch (msg['@type']) {
            case 'workflowSessionPrompt':
              this.$store.dispatch('wfPrompts/new', msg['@value'])
              break

            case 'workflowSessionResumed':
              this.$store.dispatch('wfPrompts/clear', msg['@value'])
              break

            case 'reminder':
              this.$Reminder.enqueueRaw(msg['@value'])
              break

            case 'notification':
              this.$store.dispatch('notifications/addNotification', msg['@value'])
              break

            case 'notification.read':
              this.$store.dispatch('notifications/updateReadNotification', msg['@value'])
              break

            case 'notification.unread':
              this.$store.dispatch('notifications/updateUnreadNotification', msg['@value'])
              break

            case 'notification.read.all':
              this.$store.dispatch('notifications/updateAllReadNotifications', msg['@value'])
              break

            case 'notification.unread.all':
              this.$store.dispatch('notifications/updateAllUnreadNotifications', msg['@value'])
              break

            case 'notification.delete':
              this.$store.dispatch('notifications/removeNotification', msg['@value'])
              break

            case 'error':
              this.toastDanger('Websocket message with error', msg['@value'])
          }
        })
      },
    },

    router,
    store,
    i18n: i18n(Vue,
      { app: 'corteza-webapp-compose' },
      'block',
      'chart',
      'drafts',
      'field',
      'general',
      'module',
      'namespace',
      'navigation',
      'notification',
      'notifications',
      'onboarding',
      'page',
      'permissions',
      'preview',
      'sidebar',
      'resource-translator',
    ),

    // Any additional options we want to merge
    ...options,
  }

  options.router.beforeEach((to, from, next) => {
    store.dispatch('ui/setPreviousPage', from)

    next()
  })

  const app = new Vue(options)

  // Simple HMR acceptance
  if (module.hot) {
    module.hot.accept()
  }

  return app
}
