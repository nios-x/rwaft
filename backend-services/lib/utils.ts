import fs from "fs/promises"
import path from "path"
export const genId = ()=>{
        const letters = "1234567890abcdefghijklmnopqrstuvwxyz"
        let ans = ""
        for(let i=0; i<8; i++){
            const choosen = letters[Math.floor(letters.length * Math.random())]
            ans+=choosen
        }
        return ans;
}

export const getAllFileNames = (dir:string) =>{
    const dfs = async(dir:any) => {
        let arr:any[] = []
        const files = await fs.readdir(dir)
        for (const file of files){
            if (file === '.git') {
                continue
            }
            const fullPath = path.join(dir, file)
            const stat = await fs.stat(fullPath)
            if(stat.isDirectory()){
                arr = arr.concat(await dfs(fullPath))
            }else{
                arr.push(fullPath)
            }
        }
            return arr
        }
        return dfs(dir);
}

