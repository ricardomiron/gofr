import Vue from 'vue'
import Router from 'vue-router'
import FacilityReconHome from '@/components/FacilityReconHome'
import FacilityReconUpload from '@/components/FacilityReconUpload'
import FacilityReconView from '@/components/FacilityReconView'
import FacilityReconScores from '@/components/FacilityReconScores'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'FacilityReconHome',
      component: FacilityReconHome

    },
    {
      path: '/upload',
      name: 'FacilityReconUpload',
      component: FacilityReconUpload
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
    }
  ]
})
