import Vue from 'vue'
import Router from 'vue-router'
import Login from '@/components/Login.vue'
import Configure from '@/components/Configure.vue'
import Logout from '@/components/Logout.vue'
import UsersList from '@/components/UsersList.vue'
import AddUser from '@/components/AddUser.vue'
import ChangePassword from '@/components/ChangePassword.vue'
import FacilityReconView from '@/components/FacilityReconView'
import FacilityReconScores from '@/components/FacilityReconScores'
import FacilityRecoStatus from '@/components/FacilityRecoStatus'
import FacilityReconDbAdmin from '@/components/FacilityReconDbAdmin'
import AddDataSources from '@/components/DataSources/AddDataSources'
import ViewDataSources from '@/components/DataSources/ViewDataSources'
import DataSourcesPair from '@/components/DataSourcesPair/FacilityReconDataSourcePair'
import {store} from '../store/store.js'
import VueCookies from 'vue-cookies'

Vue.use(Router)

let router = new Router({
  routes: [{
    path: '/',
    name: 'FacilityReconHome',
    component: FacilityReconScores
  },
  {
    path: '/addUser',
    name: 'AddUser',
    component: AddUser
  },
  {
    path: '/UsersList',
    name: 'UsersList',
    component: UsersList
  },
  {
    path: '/ChangePassword',
    name: 'ChangePassword',
    component: ChangePassword
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/Configure',
    name: 'Configure',
    component: Configure
  },
  {
    path: '/logout',
    name: 'Logout',
    component: Logout
  },
  {
    path: '/ViewDataSources',
    name: 'ViewDataSources',
    component: ViewDataSources
  },
  {
    path: '/AddDataSources',
    name: 'AddDataSources',
    component: AddDataSources
  },
  {
    path: '/dataSourcesPair',
    name: 'DataSourcesPair',
    component: DataSourcesPair
  },
  {
    path: '/view',
    name: 'FacilityReconView',
    component: FacilityReconView
  },
  {
    path: '/scores',
    name: 'FacilityReconScores',
    component: FacilityReconScores
  },
  {
    path: '/recoStatus',
    name: 'FacilityRecoStatus',
    component: FacilityRecoStatus
  },
  {
    path: '/dbAdmin',
    name: 'FacilityReconDbAdmin',
    component: FacilityReconDbAdmin
  }
  ]
})

router.beforeEach((to, from, next) => {
  if (!store.state.auth.token && (!VueCookies.get('token') || !VueCookies.get('userID'))) {
    if (to.path !== '/Login') {
      next({
        path: '/Login'
      })
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
