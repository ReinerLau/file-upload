<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'

/**
 * 当前上传的文件
 */
let currentFile: File

interface Chunk {
  chunk: Blob
  hash: string
  precentage: number
}

/**
 * 所有切片信息
 */
let data: Ref<Chunk[]> = ref([])

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
 * @param options.url 请求路径
 * @param options.method 请求方法
 * @param options.data 请求数据
 * @param options.headers 请求头
 */
const request = ({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = () => null
}: {
  url: string
  method?: string
  data: any
  headers?: Record<string, string>
  onProgress?: (e: ProgressEvent<EventTarget>) => any
}) => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
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
    data.value = fileChunkList.map((file, index) => ({
      chunk: file,
      hash: currentFile.name + '-' + index,
      precentage: 0
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
  const requestList = data.value
    .map((item) => {
      const formData = new FormData()
      formData.append('chunk', item.chunk)
      formData.append('hash', item.hash)
      formData.append('filename', currentFile.name)
      return formData
    })
    .map((formData, index) =>
      request({
        url: 'http://localhost:3000',
        data: formData,
        onProgress: createProgressHandler(data.value[index])
      })
    )
  // 并发上传
  await Promise.all(requestList)

  await mergeRequest()

  data.value.length = 0
}

/**
 * 每个切片生成对应的进度事件
 * @param item 每个切片
 */
const createProgressHandler = (item: Chunk) => {
  return (e: ProgressEvent<EventTarget>) => {
    item.precentage = parseInt(String((e.loaded / e.total) * 100))
  }
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

/**
 * 总进度条
 */
const uploadPrecentage = computed(() => {
  if (data.value.length === 0) return 0
  const loaded = data.value
    .map((item) => item.chunk.size * item.precentage)
    .reduce((acc, cur) => acc + cur)
  return parseInt((loaded / currentFile.size).toFixed(2))
})
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <input type="button" value="upload" @click="handleUpload" />
    <div></div>
    <div v-for="item in data" :key="item.hash">
      <span>{{ item.hash }}: </span>
      <progress :value="item.precentage" :max="100"></progress>
    </div>
    <div>
      <span>总进度: </span>
      <progress :value="uploadPrecentage" :max="100"></progress>
    </div>
  </div>
</template>

<style scoped></style>
