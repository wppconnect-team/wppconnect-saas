@minLength(1)
param imageTag string
param prefix string = 'wppmedia'
param registryName string
param environmentName string
param identityName string
param storageName string = 'media'

@secure()
param databaseUrl string

@secure()
param mediaStorageKey string

@secure()
param resultSigningSecret string

@secure()
param webhookSigningSecret string

@secure()
param transcriptionApiKey string = ''

param transcriptionBaseUrl string = 'https://api.openai.com/v1'
param transcriptionModel string = 'whisper-1'
param minimumReplicas int = 1
param maximumReplicas int = 3

var appName = '${prefix}-api'

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: resourceGroup().location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3100
        transport: 'auto'
      }
      registries: [
        {
          identity: pullIdentity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: concat([
        { name: 'database-url', value: databaseUrl }
        { name: 'media-storage-key', value: mediaStorageKey }
        { name: 'result-signing-secret', value: resultSigningSecret }
        { name: 'webhook-signing-secret', value: webhookSigningSecret }
      ], empty(transcriptionApiKey) ? [] : [
        { name: 'transcription-api-key', value: transcriptionApiKey }
      ])
    }
    template: {
      containers: [
        {
          name: 'media-api'
          image: '${registry.properties.loginServer}/wppconnect-media-api:${imageTag}'
          env: concat([
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'MEDIA_STORAGE_KEY', secretRef: 'media-storage-key' }
            { name: 'MEDIA_STORAGE_PATH', value: '/data' }
            { name: 'MEDIA_PUBLIC_URL', value: 'https://${appName}.${environment.properties.defaultDomain}' }
            { name: 'MEDIA_RESULT_SIGNING_SECRET', secretRef: 'result-signing-secret' }
            { name: 'MEDIA_WEBHOOK_SIGNING_SECRET', secretRef: 'webhook-signing-secret' }
            { name: 'MEDIA_MAX_BYTES', value: '26214400' }
            { name: 'MEDIA_MAX_DURATION_SECONDS', value: '1800' }
            { name: 'MEDIA_RETENTION_HOURS', value: '24' }
            { name: 'TRANSCRIPTION_BASE_URL', value: transcriptionBaseUrl }
            { name: 'TRANSCRIPTION_MODEL', value: transcriptionModel }
            { name: 'PORT', value: '3100' }
          ], empty(transcriptionApiKey) ? [] : [
            { name: 'TRANSCRIPTION_API_KEY', secretRef: 'transcription-api-key' }
          ])
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 3100, scheme: 'HTTP' }
              initialDelaySeconds: 3
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          volumeMounts: [
            {
              mountPath: '/data'
              volumeName: 'media'
            }
          ]
        }
      ]
      scale: {
        minReplicas: minimumReplicas
        maxReplicas: maximumReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
      volumes: [
        {
          name: 'media'
          storageName: storageName
          storageType: 'AzureFile'
        }
      ]
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output mediaApiUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
