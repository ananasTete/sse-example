import { EventEmitter } from 'events';
import type { MessagePart } from "../types/chat-advanced";

export const streamBus = new EventEmitter();

// 存储当前正在生成的任务状态
export const activeStreams = new Map<string, boolean>(); 
export const activeStreamParts = new Map<string, MessagePart[]>();
