// Jenkins pipeline mirroring .github/workflows (backend + frontend CI)
pipeline {
  agent any
  tools { nodejs 'node-20' }
  stages {
    stage('Backend: install & test') {
      steps { dir('backend') { sh 'npm ci && npm test' } }
    }
    stage('Frontend: install, lint & build') {
      steps { dir('frontend') { sh 'npm ci && npm run lint && npm run build' } }
    }
    stage('Docker image') {
      steps { dir('backend') { sh 'docker build -t merchantflow-backend:${BUILD_NUMBER} .' } }
    }
  }
  post { always { cleanWs() } }
}
