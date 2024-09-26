import * as filesystem from './base_fs.mjs'
import process from 'node:process'

async function getBucketInfo() {
    let bucketName = undefined
    let appId = undefined

    try {
        const data = await filesystem.getJsFile({
            path: '/.rise/data.mjs',
            projectRoot: process.cwd()
        })
        bucketName = data.config.bucketName
        appId = data.config.appId
    } catch (e) {
        bucketName = undefined
    }
    return {
        bucketName,
        appId
    }
}

async function getConfig() {
    let config = null
    try {
        const res = await filesystem.getJsFile({
            path: '/rise.mjs',
            projectRoot: process.cwd()
        })

        config = res.default
    } catch (e) {
        throw new Error('Project must have a rise.mjs file')
    }

    if (!config.name || typeof config.name !== 'string') {
        throw new Error(
            'rise.mjs file must export an object with a name defined'
        )
    }

    const dist = config.dist ? '/' + config.dist : 'dist'
    await await filesystem.makeDir({
        path: dist,
        projectRoot: process.cwd()
    })

    try {
        await filesystem.getFile({
            path: `/${dist}/index.html`,
            projectRoot: process.cwd()
        })
    } catch (e) {
        throw new Error(`/${dist} folder must have an index.html file`)
    }

    return config
}

export async function getProjectData() {
    const { bucketName, appId } = await getBucketInfo()
    const config = await getConfig()

    if (config.auth && !config.auth.username) {
        throw new Error(`rise.mjs auth must have a username property`)
    }

    if (config.auth && !config.auth.password) {
        throw new Error(`rise.mjs auth must have a password property`)
    }

    if (
        config.auth &&
        config.auth.password &&
        config.auth.password.length < 8
    ) {
        throw new Error(`rise.mjs auth password must be at least 8 characters`)
    }

    let projectData = {
        name: config.name,
        bucketName,
        appId,
        distFolder: config.dist || '/dist',
        backendStack: config.backendStack || 'none',
        env: config.env || {},
        auth: !config.auth
            ? false
            : {
                  username: config.auth.username,
                  password: config.auth.password
              }
    }

    return projectData
}