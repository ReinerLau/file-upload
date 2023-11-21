<script setup lang="ts">
/**
 * 当前上传的文件
 */
let currentFile: File

/**
 * 所有切片信息
 */
let data: { chunk: Blob; hash: string }[] = []

/**
 * 每个切片的大小
 */
const CHUNK_SIZE = 10 * 1024 * 1024

/**
 * 切换上传文件
 * @param e 事件对象
 */
const handleFileChange = (e: any) => {
  const file = e.target.files[0]
  if (file) {
    currentFile = file
  }
}

/**
 * 封装请求方法
 * @param options 请求选项
 */
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

/**
 * 上传文件
 */
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

/**
 * 将文件拆分成多个切片
 * @param file 上传的文件对象
 * @param size 每个切片的大小
 */
const createFileChunk = (file: File, size = CHUNK_SIZE) => {
  const fileChunkList: Blob[] = []
  let cur = 0
  while (cur < file.size) {
    fileChunkList.push(file.slice(cur, cur + size))
    cur += size
  }
  return fileChunkList
}

/**
 * 上传切片
 */
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
  // 并发上传
  await Promise.all(requestList)

  await mergeRequest()
}

/**
 * 合并文件请求
 */
const mergeRequest = async () => {
  await request({
    url: 'http://localhost:3000/merge',
    headers: {
      'content-type': 'application/json'
    },
    data: JSON.stringify({
      filename: currentFile.name,
      chunkSize: CHUNK_SIZE
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
