import * as FileSystem from 'expo-file-system/legacy'

function slugify(filename) {
  return filename
    .replace(/\.(md|mdx|txt)$/, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) }
  } catch (err) {
    if (err.message?.includes('Network request failed')) {
      return { ok: false, status: 0, data: { message: 'No internet connection.' } }
    }
    return { ok: false, status: 0, data: { message: err.message } }
  }
}

function errorMessage(status, data) {
  if (status === 0) return data.message || 'No internet connection.'
  if (status === 401) return 'Invalid GitLab token. Check Settings.'
  if (status === 404) return 'Project not found. Check the project path in Settings.'
  if (status === 400 && data.message?.includes('already exists'))
    return 'A file with this name already exists. Rename the file slightly and try again.'
  return data.message || `GitLab error ${status}`
}

// Push a markdown/text file to the repo
export async function publishFileToGitLab(filename, content, settings, sitePath) {
  if (!settings.token) return { ok: false, error: 'No GitLab token set. Go to Settings.' }

  const slug = slugify(filename)
  if (!slug) return { ok: false, error: 'Filename must contain letters or numbers.' }

  const encoded = btoa(unescape(encodeURIComponent(content)))
  const filePath = `${sitePath}/${slug}.md`
  const encodedProject = encodeURIComponent(settings.project)
  const encodedFilePath = encodeURIComponent(filePath)
  const url = `https://gitlab.com/api/v4/projects/${encodedProject}/repository/files/${encodedFilePath}`

  const res = await gitlabRequest('POST', url, settings.token, {
    branch: 'main',
    content: encoded,
    commit_message: `add: ${slug}`,
    encoding: 'base64',
  })

  if (res.ok) return { ok: true, filePath }
  return { ok: false, error: errorMessage(res.status, res.data) }
}

// Push an image file to the site's public/blog-images/ folder
export async function publishImageToGitLab(img, settings, siteConfig) {
  if (!settings.token) return { ok: false, error: 'No GitLab token set.' }

  let base64
  try {
    base64 = await FileSystem.readAsStringAsync(img.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('Failed to read image', { err, image: img })
    return { ok: false, error: `Could not read image: ${img.filename}. ${detail}` }
  }

  // Derive the public images path from the site path
  // e.g. Temporal-Flow/src/content/posts -> Temporal-Flow/public/blog-images
  const siteRoot = siteConfig.path.split('/')[0]
  const imagePath = `${siteRoot}/public/blog-images/${img.filename}`
  const encodedProject = encodeURIComponent(settings.project)
  const encodedFilePath = encodeURIComponent(imagePath)
  const url = `https://gitlab.com/api/v4/projects/${encodedProject}/repository/files/${encodedFilePath}`

  const res = await gitlabRequest('POST', url, settings.token, {
    branch: 'main',
    content: base64,
    commit_message: `add image: ${img.filename}`,
    encoding: 'base64',
  })

  if (res.ok) return { ok: true, publicPath: `/blog-images/${img.filename}` }

  // If already exists, that's fine — image is already there
  if (res.status === 400 && res.data.message?.includes('already exists')) {
    return { ok: true, publicPath: `/blog-images/${img.filename}` }
  }

  return { ok: false, error: errorMessage(res.status, res.data) }
}
