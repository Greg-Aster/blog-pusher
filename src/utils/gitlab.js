import * as FileSystem from 'expo-file-system/legacy'

function slugify(filename) {
  return filename
    .replace(/\.(md|mdx|txt)$/i, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function utf8ToBase64(value) {
  return btoa(unescape(encodeURIComponent(value)))
}

function encodePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function getProviderConfig(settings, provider) {
  const providers = settings?.providers || {}
  if (provider === 'github') {
    return {
      token: providers.github?.token || '',
      owner: providers.github?.owner || '',
      repo: providers.github?.repo || '',
      branch: providers.github?.branch || 'main',
    }
  }
  return {
    token: providers.gitlab?.token || settings?.token || '',
    project: providers.gitlab?.project || settings?.project || '',
    branch: providers.gitlab?.branch || 'main',
  }
}

function getDataMessage(data) {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (typeof data.message === 'string') return data.message
  if (data.message && typeof data.message === 'object') {
    return JSON.stringify(data.message)
  }
  return JSON.stringify(data)
}

async function parseResponseData(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function gitlabRequest(method, url, token, body) {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await parseResponseData(response)
    return { ok: response.ok, status: response.status, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Network request failed')) {
      return { ok: false, status: 0, data: { message: 'No internet connection.' } }
    }
    return { ok: false, status: 0, data: { message } }
  }
}

async function githubRequest(method, url, token, body) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
  }
  if (body) headers['Content-Type'] = 'application/json'

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await parseResponseData(response)
    return { ok: response.ok, status: response.status, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Network request failed')) {
      return { ok: false, status: 0, data: { message: 'No internet connection.' } }
    }
    return { ok: false, status: 0, data: { message } }
  }
}

function gitlabErrorMessage(status, data) {
  const message = getDataMessage(data)
  if (status === 0) return message || 'No internet connection.'
  if (status === 401) return 'Invalid GitLab token. Check Settings.'
  if (status === 404) return 'GitLab project not found. Check project path in Settings.'
  if (
    status === 400 &&
    (message.toLowerCase().includes('already exists') ||
      message.toLowerCase().includes('has already been taken'))
  ) {
    return 'A file with this name already exists. Rename the file slightly and try again.'
  }
  return message || `GitLab error ${status}`
}

function isGitHubAlreadyExists(status, data) {
  if (status !== 422) return false
  const message = getDataMessage(data).toLowerCase()
  if (message.includes('already exists') || message.includes('sha')) return true
  if (Array.isArray(data?.errors)) {
    return data.errors.some(err => {
      const errMsg = `${err?.code || ''} ${err?.message || ''}`.toLowerCase()
      return errMsg.includes('already exists') || errMsg.includes('already_exists')
    })
  }
  return false
}

function githubErrorMessage(status, data) {
  const message = getDataMessage(data)
  if (status === 0) return message || 'No internet connection.'
  if (status === 401 || status === 403) {
    return 'Invalid GitHub token or insufficient permissions. Check Settings.'
  }
  if (status === 404) {
    return 'GitHub repo not found, or token lacks repo access. Check owner/repo in Settings.'
  }
  if (isGitHubAlreadyExists(status, data)) {
    return 'A file with this name already exists. Rename the file slightly and try again.'
  }
  return message || `GitHub error ${status}`
}

function getPostFilePath(filename, sitePath) {
  const slug = slugify(filename)
  if (!slug) return { error: 'Filename must contain letters or numbers.' }
  const normalizedSitePath = String(sitePath || '').trim().replace(/^\/+|\/+$/g, '')
  if (!normalizedSitePath) return { error: 'Site path is empty. Check Settings.' }
  return { slug, filePath: `${normalizedSitePath}/${slug}.md` }
}

function getImagePath(siteConfig, filename) {
  const sitePath = String(siteConfig?.path || '').trim().replace(/^\/+|\/+$/g, '')
  const siteRoot = sitePath.split('/')[0]
  if (!siteRoot) return null
  return `${siteRoot}/public/blog-images/${filename}`
}

async function readImageBase64(img) {
  try {
    return await FileSystem.readAsStringAsync(img.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('Failed to read image', { err, image: img })
    throw new Error(`Could not read image: ${img.filename}. ${detail}`)
  }
}

export async function publishFileToGitLab(filename, content, settings, sitePath) {
  const gitlab = getProviderConfig(settings, 'gitlab')
  if (!gitlab.token) return { ok: false, error: 'No GitLab token set. Go to Settings.' }
  if (!gitlab.project) return { ok: false, error: 'No GitLab project set. Go to Settings.' }

  const post = getPostFilePath(filename, sitePath)
  if (post.error) return { ok: false, error: post.error }

  const encodedProject = encodeURIComponent(gitlab.project)
  const encodedFilePath = encodeURIComponent(post.filePath)
  const url = `https://gitlab.com/api/v4/projects/${encodedProject}/repository/files/${encodedFilePath}`
  const res = await gitlabRequest('POST', url, gitlab.token, {
    branch: gitlab.branch || 'main',
    content: utf8ToBase64(content),
    commit_message: `add: ${post.slug}`,
    encoding: 'base64',
  })

  if (res.ok) return { ok: true, filePath: post.filePath }
  return { ok: false, error: gitlabErrorMessage(res.status, res.data) }
}

export async function publishImageToGitLab(img, settings, siteConfig) {
  const gitlab = getProviderConfig(settings, 'gitlab')
  if (!gitlab.token) return { ok: false, error: 'No GitLab token set.' }
  if (!gitlab.project) return { ok: false, error: 'No GitLab project set.' }

  let base64
  try {
    base64 = await readImageBase64(img)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const imagePath = getImagePath(siteConfig, img.filename)
  if (!imagePath) return { ok: false, error: 'Site path is empty. Check Settings.' }
  const encodedProject = encodeURIComponent(gitlab.project)
  const encodedFilePath = encodeURIComponent(imagePath)
  const url = `https://gitlab.com/api/v4/projects/${encodedProject}/repository/files/${encodedFilePath}`
  const res = await gitlabRequest('POST', url, gitlab.token, {
    branch: gitlab.branch || 'main',
    content: base64,
    commit_message: `add image: ${img.filename}`,
    encoding: 'base64',
  })

  if (res.ok) return { ok: true, publicPath: `/blog-images/${img.filename}` }

  const message = getDataMessage(res.data).toLowerCase()
  if (
    res.status === 400 &&
    (message.includes('already exists') || message.includes('has already been taken'))
  ) {
    return { ok: true, publicPath: `/blog-images/${img.filename}` }
  }

  return { ok: false, error: gitlabErrorMessage(res.status, res.data) }
}

export async function publishFileToGitHub(filename, content, settings, sitePath) {
  const github = getProviderConfig(settings, 'github')
  if (!github.token) return { ok: false, error: 'No GitHub token set. Go to Settings.' }
  if (!github.owner || !github.repo) {
    return { ok: false, error: 'GitHub owner/repo is missing. Go to Settings.' }
  }

  const post = getPostFilePath(filename, sitePath)
  if (post.error) return { ok: false, error: post.error }

  const owner = encodeURIComponent(github.owner.trim())
  const repo = encodeURIComponent(github.repo.trim())
  const encodedPath = encodePath(post.filePath)
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`
  const res = await githubRequest('PUT', url, github.token, {
    message: `add: ${post.slug}`,
    content: utf8ToBase64(content),
    branch: github.branch || 'main',
  })

  if (res.ok) return { ok: true, filePath: post.filePath }
  return { ok: false, error: githubErrorMessage(res.status, res.data) }
}

export async function publishImageToGitHub(img, settings, siteConfig) {
  const github = getProviderConfig(settings, 'github')
  if (!github.token) return { ok: false, error: 'No GitHub token set.' }
  if (!github.owner || !github.repo) {
    return { ok: false, error: 'GitHub owner/repo is missing. Go to Settings.' }
  }

  let base64
  try {
    base64 = await readImageBase64(img)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const imagePath = getImagePath(siteConfig, img.filename)
  if (!imagePath) return { ok: false, error: 'Site path is empty. Check Settings.' }
  const owner = encodeURIComponent(github.owner.trim())
  const repo = encodeURIComponent(github.repo.trim())
  const encodedPath = encodePath(imagePath)
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`
  const res = await githubRequest('PUT', url, github.token, {
    message: `add image: ${img.filename}`,
    content: base64,
    branch: github.branch || 'main',
  })

  if (res.ok) return { ok: true, publicPath: `/blog-images/${img.filename}` }
  if (isGitHubAlreadyExists(res.status, res.data)) {
    return { ok: true, publicPath: `/blog-images/${img.filename}` }
  }

  return { ok: false, error: githubErrorMessage(res.status, res.data) }
}

export async function publishFile(filename, content, settings, sitePath, provider = 'gitlab') {
  if (provider === 'github') {
    return publishFileToGitHub(filename, content, settings, sitePath)
  }
  return publishFileToGitLab(filename, content, settings, sitePath)
}

export async function publishImage(img, settings, siteConfig, provider = 'gitlab') {
  if (provider === 'github') {
    return publishImageToGitHub(img, settings, siteConfig)
  }
  return publishImageToGitLab(img, settings, siteConfig)
}
