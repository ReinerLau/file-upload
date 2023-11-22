<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'

/**
 * 当前上传的文件
 */
let currentFile: File

/**
 * 当前上传的文件 hash
 */
let currentFileHash: string

interface Chunk {
  chunk: Blob
  chunkHash: string
  precentage: number
  fileHash: string
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
 * hash 计算进度
 */
const hashPrecentage = ref(0)

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
 * 正在上传的请求
 */
const requestList: XMLHttpRequest[] = []

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
  headers?: Record<string, any>
  onProgress?: (e: ProgressEvent<EventTarget>) => any
}) => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
    xhr.open(method, url)
    Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]))
    xhr.send(data)
    xhr.onload = (e: any) => {
      if (requestList) {
        const xhrIndex = requestList.findIndex((item) => item === xhr)
        requestList.splice(xhrIndex, 1)
      }
      resolve({
        data: e.target.response
      })
    }
    requestList.push(xhr)
  })
}

const handlePause = () => {
  requestList.forEach((xhr) => xhr.abort())
  requestList.length = 0
}

/**
 * 上传文件
 */
const handleUpload = async () => {
  if (currentFile) {
    const fileChunkList = createFileChunk(currentFile)
    currentFileHash = await calculateHash(fileChunkList)
    const { shouldUpload } = await verifyUpload(currentFile.name, currentFileHash)
    if (shouldUpload) {
      data.value = fileChunkList.map((file, index) => ({
        chunk: file,
        chunkHash: currentFileHash + '-' + index,
        precentage: 0,
        fileHash: currentFileHash
      }))
      await uploadChunks()
    } else {
      hashPrecentage.value = 0
      alert('跳过')
    }
  }
}

/**
 * 校验服务器是否已经存在文件
 * @param fileName 文件名
 * @param fileHash 文件 hash
 */
const verifyUpload = async (fileName: string, fileHash: string): Promise<Record<string, any>> => {
  const res: any = await request({
    url: 'http://localhost:3000/verify',
    headers: {
      'content-type': 'application/json'
    },
    data: JSON.stringify({
      fileName,
      fileHash
    })
  })
  return JSON.parse(res.data)
}

/**
 * 计算 hash
 * @param fileChunkList 切片列表
 */
const calculateHash = (fileChunkList: Blob[]): Promise<string> => {
  return new Promise((resolve) => {
    const worker = new Worker('/hash.js')

    worker.postMessage({ fileChunkList })

    worker.onmessage = (e) => {
      const { precentage, hash } = e.data

      hashPrecentage.value = precentage

      if (hash) {
        resolve(hash)
      }
    }
  })
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
      formData.append('chunkHash', item.chunkHash)
      formData.append('filename', currentFile.name)
      formData.append('fileHash', item.fileHash)
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
  hashPrecentage.value = 0
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
      chunkSize: CHUNK_SIZE,
      fileHash: currentFileHash
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
    <input type="button" value="pause" @click="handlePause" />
    <div></div>
    <div v-for="item in data" :key="item.chunkHash">
      <span>{{ item.chunkHash }}: </span>
      <progress :value="item.precentage" :max="100"></progress>
    </div>
    <div>
      <span>hash 进度: </span>
      <progress :value="hashPrecentage" :max="100"></progress>
    </div>
    <div>
      <span>总进度: </span>
      <progress :value="uploadPrecentage" :max="100"></progress>
    </div>
  </div>
</template>

<style scoped></style>
