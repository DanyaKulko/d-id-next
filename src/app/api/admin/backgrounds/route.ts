import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const uploadRoot = path.join(process.cwd(), "public", "uploads", "backgrounds");
const maxUploadMb = 25;

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

export async function POST(request: Request) {
  const formData = await request.formData();
  const agentKeyRaw = formData.get("agentKey") ?? formData.get("roleId");
  const titleRaw = formData.get("title");
  // const themeRaw = formData.get("theme");
  const file = formData.get("file");

  if (typeof agentKeyRaw !== "string" || !agentKeyRaw.trim()) {
    return NextResponse.json({ error: "Invalid agent key" }, { status: 400 });
  }

  // const theme =
  //   typeof themeRaw === "string" && isBackgroundTheme(themeRaw)
  //     ? themeRaw.trim()
  //     : "default";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (file.size > maxUploadMb * 1024 * 1024) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only images are allowed" },
      { status: 415 },
    );
  }

  const agent = await prisma.agent.findFirst({
    where: {
      OR: [
        { slug: agentKeyRaw },
        { id: agentKeyRaw },
        { agentId: agentKeyRaw },
      ],
    },
  });
  if (!agent) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : file.name;
  const extension = path.extname(file.name) || ".png";
  const safeBase = sanitizeFileName(path.basename(file.name, extension));
  const fileName = `${Date.now()}-${safeBase}-${randomUUID()}${extension}`;
  const agentDir = path.join(uploadRoot, agent.id);

  await mkdir(agentDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const destination = path.join(agentDir, fileName);
  await writeFile(destination, buffer);

  const url = `/uploads/backgrounds/${agent.id}/${fileName}`;

  const background = await prisma.agentBackground.create({
    data: {
      agentId: agent.id,
      title,
      theme: "default",
      url,
    },
  });

  return NextResponse.json({
    id: background.id,
    title: background.title,
    theme: background.theme,
    url: background.url,
  });
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.id !== "string") {
    return NextResponse.json(
      { error: "Background id is required" },
      { status: 400 },
    );
  }

  const background = await prisma.agentBackground.findUnique({
    where: { id: payload.id },
  });
  if (!background) {
    return NextResponse.json(
      { error: "Background not found" },
      { status: 404 },
    );
  }

  await prisma.agentBackground.delete({ where: { id: background.id } });

  const localPath = path.join(
    process.cwd(),
    "public",
    background.url.replace(/^\/+/, ""),
  );
  await unlink(localPath).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const formData = await request.formData();
  const idRaw = formData.get("backgroundId") ?? formData.get("id");
  const titleRaw = formData.get("title");
  const file = formData.get("file");

  if (typeof idRaw !== "string" || !idRaw.trim()) {
    return NextResponse.json(
      { error: "Background id is required" },
      { status: 400 },
    );
  }

  const background = await prisma.agentBackground.findUnique({
    where: { id: idRaw },
  });
  if (!background) {
    return NextResponse.json(
      { error: "Background not found" },
      { status: 404 },
    );
  }

  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : background.title;

  let nextUrl = background.url;
  let oldFilePath: string | null = null;

  if (file instanceof File) {
    if (file.size > maxUploadMb * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large" }, { status: 413 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only images are allowed" },
        { status: 415 },
      );
    }

    const extension = path.extname(file.name) || ".png";
    const safeBase = sanitizeFileName(path.basename(file.name, extension));
    const fileName = `${Date.now()}-${safeBase}-${randomUUID()}${extension}`;
    const agentDir = path.join(uploadRoot, background.agentId);

    await mkdir(agentDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const destination = path.join(agentDir, fileName);
    await writeFile(destination, buffer);

    nextUrl = `/uploads/backgrounds/${background.agentId}/${fileName}`;
    oldFilePath = path.join(
      process.cwd(),
      "public",
      background.url.replace(/^\/+/, ""),
    );
  }

  const updated = await prisma.agentBackground.update({
    where: { id: background.id },
    data: {
      title,
      url: nextUrl,
    },
  });

  if (oldFilePath) {
    await unlink(oldFilePath).catch(() => undefined);
  }

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    theme: updated.theme,
    url: updated.url,
  });
}
