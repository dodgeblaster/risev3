import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Helpers
 */
function formatWithTrailingSlash(x) {
    return x + (x[x.length - 1] !== '/' ? '/' : '')
}

/**
 * Folders
 */
export function getDirectories(input) {
    return fs
        .readdirSync(input.projectRoot + input.path, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
}

export async function makeDir(input) {
    try {
        await fs.promises.mkdir(input.projectRoot + input.path, { recursive: true })
    } catch (e) {
        if (e instanceof Error) {
            if (e.code === 'EEXIST') {
                return
            }
            throw new Error(e.message)
        } else {
            throw new Error('Unknown Error')
        }
    }
}

export async function removeDir(input) {
    const thepath = input.projectRoot + input.path
    await fs.promises.rm(thepath, { recursive: true, force: true })
}

export function copyDir(input) {
    const source = input.projectRoot + input.source
    const target = input.projectRoot + input.target

    fs.cpSync(source, target, { recursive: true })
}

export async function zipFolder(input) {
    const source = input.projectRoot + input.source;
    const target = input.projectRoot + formatWithTrailingSlash(input.target);
    const name = input.name;

    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    const zipFilePath = path.join(target, `${name}.zip`);

    return new Promise((resolve, reject) => {
        let command;
        if (os.platform() === 'win32') {
            // Windows command using PowerShell
            command = `powershell.exe -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; $compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal; $includeBaseDirectory = $false; [System.IO.Compression.ZipFile]::CreateFromDirectory('${source}', '${zipFilePath}', $compressionLevel, $includeBaseDirectory); }"`;
        } else {
            // Unix-like systems (Linux, macOS) using zip command
            command = `cd "${source}" && zip -r "${zipFilePath}" .`;
        }

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                reject(new Error(stderr));
                return;
            }
            console.log(`stdout: ${stdout}`);
            resolve();
        });
    });
}

/**
 * Files
 */
export async function getFile(input) {
    const filePath = input.projectRoot + input.path
    return await fs.promises.readFile(filePath)
}

export function getJsFile(input) {
    const filePath = input.projectRoot + input.path
    return import(filePath)
}

export function writeFile(input) {
    const filePath = input.projectRoot + input.path
    fs.writeFileSync(filePath, input.content)
}

export function removeFile(input) {
    const filePath = input.projectRoot + input.path
    fs.unlinkSync(filePath)
}

export function copyFile(input) {
    const source = input.projectRoot + input.source
    const target = input.projectRoot + input.target
    fs.copyFileSync(source, target)
}

export async function getTextContent(input) {
    const filePath = input.projectRoot + input.path
    return fs.readFileSync(filePath, 'utf8')
}