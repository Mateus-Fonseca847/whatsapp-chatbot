import dotenv from "dotenv";
dotenv.config();
import { processarMensagem } from "./bot/conversation.js";

const resposta = await processarMensagem("5511999999999", "oi, voces vendem pijama?");
console.log(resposta);