<script setup lang="ts">
let currentFile: File

let data: { chunk: Blob; hash: string }[] = []

const handleFileChange = (e: any) => {
  const file = e.target.files[0]
  if (file) {
    currentFile = file
  }
}

const request = ({
  url,
  method = 'post',
  data,
  headers = {}
}: {
  url: string
  method?: string
  data: any
  headers?: Record<string, string>
}) => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]))
    xhr.send(data)
    xhr.onload = (e: any) => {
      resolve({
        data: e.target.response
      })
    }
  })
}

const handleUpload = async () => {
  if (currentFile) {
    const fileChunkList = createFileChunk(currentFile)
    data = fileChunkList.map((file, index) => ({
      chunk: file,
      hash: currentFile.name + '-' + index
    }))
    await uploadChunks()
  }
}

const createFileChunk = (file: File, size = 10 * 1024 * 1024) => {
  const fileChunkList: Blob[] = []
  let cur = 0
  while (cur < file.size) {
    fileChunkList.push(file.slice(cur, cur + size))
    cur += size
  }
  return fileChunkList
}

const uploadChunks = async () => {
  const requestList = data
    .map((item) => {
      const formData = new FormData()
      formData.append('chunk', item.chunk)
      formData.append('hash', item.hash)
      formData.append('filename', currentFile.name)
      return formData
    })
    .map((formData) =>
      request({
        url: 'http://localhost:3000',
        data: formData
      })
    )
  await Promise.all(requestList)

  await mergeRequest()
}

const mergeRequest = async () => {
  await request({
    url: 'http://localhost:3000/merge',
    headers: {
      'content-type': 'application/json'
    },
    data: JSON.stringify({
      filename: currentFile.name
    })
  })
}
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <input type="button" value="upload" @click="handleUpload" />
  </div>
</template>

<style scoped></style>
