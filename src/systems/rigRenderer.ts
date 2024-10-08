import {
	IBlueprintCameraConfigJSON,
	type IBlueprintBoneConfigJSON,
	IBlueprintLocatorConfigJSON,
	IBlueprintTextDisplayConfigJSON,
} from '../blueprintFormat'
import { BoneConfig } from '../nodeConfigs'
import { Alignment, TextDisplay } from '../outliner/textDisplay'
import {
	IMinecraftResourceLocation,
	parseResourcePackPath,
	toSafeFuntionName,
} from '../util/minecraftUtil'
import { TRANSPARENT_TEXTURE, TRANSPARENT_TEXTURE_RESOURCE_LOCATION, Variant } from '../variants'
import {
	correctSceneAngle,
	getNodeTransforms,
	INodeTransform,
	restoreSceneAngle,
	updatePreview,
} from './animationRenderer'
import * as crypto from 'crypto'
import { JsonText } from './minecraft/jsonText'
import { VanillaItemDisplay } from '../outliner/vanillaItemDisplay'
import { VanillaBlockDisplay } from '../outliner/vanillaBlockDisplay'
import { IntentionalExportError } from './exporter'

export interface IRenderedFace {
	uv: number[]
	rotation?: number
	texture: string
	cullface?: string
	tintindex?: number
}

export interface IRenderedElement {
	from: number[]
	to: number[]
	shade?: boolean
	rotation?:
		| {
				angle: number
				axis: string
				origin: number[]
				rescale?: boolean
		  }
		| number[]
	faces?: Record<string, IRenderedFace>
}

/**
 * An actual Minecraft model
 */
export interface IRenderedModel {
	parent?: string
	textures: Record<string, string>
	elements?: IRenderedElement[]
	display?: {
		head: { rotation: [0, number, 0] }
	}
}

export interface IRenderedNode {
	type: string
	parent: string
	parentNode: Group | null
	name: string
	node: OutlinerNode
	uuid: string
}

export interface ICamera extends OutlinerElement {
	name: string
	path: string
	position: ArrayVector3
	rotation: ArrayVector3
	linked_preview: string
	camera_linked: boolean
	visibility: boolean
	config: IBlueprintCameraConfigJSON
	preview_controller: NodePreviewController
}

export interface IRenderedNodes {
	Bone: IRenderedNode & {
		type: 'bone'
		node: Group
		model: IRenderedModel
		customModelData: number
		modelPath: string
		resourceLocation: string
		boundingBox: THREE.Box3
		scale: number
		configs: {
			default?: IBlueprintBoneConfigJSON
			variants: Record<string, IBlueprintBoneConfigJSON>
		}
	}
	Camera: IRenderedNode & {
		type: 'camera'
		name: string
		node: ICamera
		config: IBlueprintCameraConfigJSON
	}
	Locator: IRenderedNode & {
		type: 'locator'
		node: Locator
		config: IBlueprintLocatorConfigJSON
	}
	TextDisplay: IRenderedNode & {
		type: 'text_display'
		node: TextDisplay
		text?: JsonText
		lineWidth: number
		backgroundColor: string
		backgroundAlpha: number
		align: Alignment
		scale: number
		config?: IBlueprintTextDisplayConfigJSON
	}
	ItemDisplay: IRenderedNode & {
		type: 'item_display'
		node: VanillaItemDisplay
		item: string
		scale: number
		config?: IBlueprintBoneConfigJSON
	}
	BlockDisplay: IRenderedNode & {
		type: 'block_display'
		node: VanillaBlockDisplay
		block: string
		scale: number
		config?: IBlueprintBoneConfigJSON
	}
}

export type AnyRenderedNode = IRenderedNodes[keyof IRenderedNodes]

export interface IRenderedBoneVariant {
	model: IRenderedModel
	customModelData: number
	modelPath: string
	resourceLocation: string
}

export interface INodeStructure {
	uuid: string
	children: INodeStructure[]
}

export interface IRenderedRig {
	/**
	 * A map of bone UUIDs to rendered models
	 */
	models: Record<string, IRenderedModel>
	/**
	 * A map of variant UUIDs to maps of rendered models
	 */
	variantModels: Record<string, Record<string, IRenderedBoneVariant>>
	/**
	 * A map of outliner node UUIDs to rendered bones
	 */
	nodeMap: Record<string, AnyRenderedNode>
	/**
	 * The recursive structure of node UUIDs
	 */
	nodeStructure: INodeStructure
	/**
	 * A map of texture UUIDs to textures
	 */
	textures: Record<string, Texture>
	/**
	 * The default transform of the rig as an Animation frame
	 */
	defaultTransforms: INodeTransform[]
	/**
	 * The export folder for the rig models
	 */
	modelExportFolder: string
	/**
	 * The export folder for the rig textures
	 */
	textureExportFolder: string
	/**
	 * Whether or not this rig includes Cubes
	 */
	includesCustomModels: boolean
}

function renderCube(cube: Cube, rig: IRenderedRig, model: IRenderedModel) {
	if (!cube.export) return

	const element = {} as IRenderedElement

	element.from = cube.from.slice()
	element.to = cube.to.slice()

	if (cube.inflate) {
		element.from = element.from.map(v => v - cube.inflate)
		element.to = element.to.map(v => v + cube.inflate)
	}

	if (cube.shade === false) element.shade = false

	if (!(cube.rotation.allEqual(0) && cube.origin.allEqual(0))) {
		const axis = cube.rotationAxis() || 'y'
		element.rotation = {
			angle: cube.rotation[getAxisNumber(axis)],
			axis,
			origin: cube.origin,
		}
	}

	if (cube.rescale) {
		// @ts-ignore
		if (element.rotation) element.rotation.rescale = true
		else
			element.rotation = {
				angle: 0,
				axis: cube.rotation_axis || 'y',
				origin: cube.origin,
				rescale: true,
			}
	}

	if (cube.parent instanceof Group) {
		const parent = cube.parent
		element.from = element.from.map((v, i) => v - parent.origin[i])
		element.to = element.to.map((v, i) => v - parent.origin[i])
		if (element.rotation && !Array.isArray(element.rotation)) {
			element.rotation.origin = element.rotation.origin.map((v, i) => v - parent.origin[i])
		}
	}

	element.faces = {}
	for (const [face, data] of Object.entries(cube.faces)) {
		if (!data) continue
		if (!data.texture || data.getTexture()?.uuid === TRANSPARENT_TEXTURE.uuid) continue
		const renderedFace = {} as IRenderedFace
		if (data.enabled) {
			renderedFace.uv = data.uv
				.slice()
				.map((v, i) => (v * 16) / UVEditor.getResolution(i % 2))
		}
		if (data.rotation) renderedFace.rotation = data.rotation
		if (data.texture) {
			const texture = data.getTexture()
			if (!texture) throw new Error('Texture not found')
			renderedFace.texture = '#' + texture.id
			rig.textures[texture.id] = texture
			const resourceLocation = getTextureResourceLocation(texture, rig).resourceLocation
			if (resourceLocation) model.textures[texture.id] = resourceLocation
		}
		if (data.cullface) renderedFace.cullface = data.cullface
		if (data.tint >= 0) renderedFace.tintindex = data.tint
		element.faces[face] = renderedFace
	}

	if (Object.keys(element.faces).length === 0) return
	return element
}

const TEXTURE_RESOURCE_LOCATION_CACHE = new Map<string, IMinecraftResourceLocation>()
export function getTextureResourceLocation(texture: Texture, rig: IRenderedRig) {
	if (TEXTURE_RESOURCE_LOCATION_CACHE.has(texture.uuid)) {
		return TEXTURE_RESOURCE_LOCATION_CACHE.get(texture.uuid)!
	}
	if (!texture.name.endsWith('.png')) texture.name += '.png'
	if (texture.path && fs.existsSync(texture.path) && fs.statSync(texture.path).isFile()) {
		const parsed = parseResourcePackPath(texture.path)
		if (parsed) {
			TEXTURE_RESOURCE_LOCATION_CACHE.set(texture.uuid, parsed)
			return parsed
		}
	}
	const path = PathModule.join(rig.textureExportFolder, toSafeFuntionName(texture.name))
	const parsed = parseResourcePackPath(path)
	if (parsed) {
		TEXTURE_RESOURCE_LOCATION_CACHE.set(texture.uuid, parsed)
		return parsed
	}

	console.error(texture)
	throw new Error(`Invalid texture path: ${path}`)
}

function getBoneBoundingBox(group: Group) {
	const children = group.children.filter(e => e instanceof Cube) as Cube[]
	const box = new THREE.Box3()
	box.expandByPoint(new THREE.Vector3(group.origin[0], group.origin[1], group.origin[2]))
	for (const child of children) {
		box.expandByPoint(
			new THREE.Vector3(
				child.from[0] - child.inflate,
				child.from[1] - child.inflate,
				child.from[2] - child.inflate
			)
		)
		box.expandByPoint(
			new THREE.Vector3(
				child.to[0] + child.inflate,
				child.to[1] + child.inflate,
				child.to[2] + child.inflate
			)
		)
	}
	return box
}

function renderGroup(group: Group, rig: IRenderedRig): INodeStructure | undefined {
	if (!group.export) return
	const parentId = (group.parent instanceof Group ? group.parent.uuid : group.parent)!

	const path = PathModule.join(rig.modelExportFolder, group.name + `.json`)
	const parsed = parseResourcePackPath(path)

	if (!parsed) {
		console.error(group)
		throw new Error(`Invalid bone path: ${group.name} -> ${path}`)
	}

	const renderedBone: IRenderedNodes['Bone'] & {
		model: { elements: IRenderedElement[] }
	} = {
		type: 'bone',
		parent: parentId,
		parentNode: group.parent instanceof Group ? group.parent : null,
		node: group,
		name: group.name,
		uuid: group.uuid,
		model: {
			textures: {},
			elements: [],
			display: { head: { rotation: [0, 180, 0] } },
		},
		modelPath: path,
		customModelData: -1,
		resourceLocation: parsed.resourceLocation,
		boundingBox: getBoneBoundingBox(group),
		scale: 1,
		configs: group.configs,
	}

	const structure: INodeStructure = {
		uuid: group.uuid,
		children: [],
	}

	for (const node of group.children) {
		if (!node.export) continue
		switch (true) {
			case node instanceof Group: {
				const bone = renderGroup(node, rig)
				if (bone) structure.children.push(bone)
				break
			}
			case node instanceof Locator: {
				const locator = renderLocator(node, rig)
				if (locator) structure.children.push(locator)
				break
			}
			case node instanceof TextDisplay: {
				const textDisplay = renderTextDisplay(node, rig)
				if (textDisplay) structure.children.push(textDisplay)
				break
			}
			case OutlinerElement.types.camera && node instanceof OutlinerElement.types.camera: {
				const camera = renderCamera(node as ICamera, rig)
				if (camera) structure.children.push(camera)
				break
			}
			case node instanceof VanillaItemDisplay: {
				const display = renderItemDisplay(node, rig)
				if (display) structure.children.push(display)
				break
			}
			case node instanceof VanillaBlockDisplay: {
				const display = renderBlockDisplay(node, rig)
				if (display) structure.children.push(display)
				break
			}
			case node instanceof Cube: {
				const element = renderCube(node, rig, renderedBone.model)
				rig.includesCustomModels = true
				if (element) renderedBone.model.elements.push(element)
				break
			}
			default:
				console.warn(`Encountered unknown node type:`, node)
		}
	}

	// Don't export groups without a model.
	if (group.children.filter(c => c instanceof Cube).length === 0) return structure

	const diff = new THREE.Vector3().subVectors(
		renderedBone.boundingBox.max,
		renderedBone.boundingBox.min
	)
	const max = Math.max(diff.x, diff.y, diff.z)
	const scale = Math.min(1, 24 / max)
	for (const element of renderedBone.model.elements) {
		element.from = element.from.map(v => v * scale + 8)
		element.to = element.to.map(v => v * scale + 8)
		if (element.rotation && !Array.isArray(element.rotation)) {
			element.rotation.origin = element.rotation.origin.map(v => v * scale + 8)
		}
	}

	renderedBone.scale = 1 / scale
	rig.models[group.uuid] = renderedBone.model
	rig.nodeMap[group.uuid] = renderedBone
	return structure
}

function renderItemDisplay(
	display: VanillaItemDisplay,
	rig: IRenderedRig
): INodeStructure | undefined {
	if (!display.export) return
	const parentId = (display.parent instanceof Group ? display.parent.uuid : display.parent)!

	const path = PathModule.join(rig.modelExportFolder, display.name + `.json`)
	const parsed = parseResourcePackPath(path)

	if (!parsed) {
		console.error(display)
		throw new Error(`Invalid bone path: ${display.name} -> ${path}`)
	}

	const renderedBone: IRenderedNodes['ItemDisplay'] = {
		type: 'item_display',
		parent: parentId,
		parentNode: display.parent instanceof Group ? display.parent : null,
		node: display,
		name: display.name,
		uuid: display.uuid,
		item: display.item,
		scale: 1,
		config: display.config,
	}

	rig.nodeMap[display.uuid] = renderedBone
	return {
		uuid: display.uuid,
		children: [],
	}
}

function renderBlockDisplay(
	display: VanillaBlockDisplay,
	rig: IRenderedRig
): INodeStructure | undefined {
	if (!display.export) return
	const parentId = (display.parent instanceof Group ? display.parent.uuid : display.parent)!

	const path = PathModule.join(rig.modelExportFolder, display.name + `.json`)
	const parsed = parseResourcePackPath(path)

	if (!parsed) {
		console.error(display)
		throw new Error(`Invalid bone path: ${display.name} -> ${path}`)
	}

	const renderedBone: IRenderedNodes['BlockDisplay'] = {
		type: 'block_display',
		parent: parentId,
		parentNode: display.parent instanceof Group ? display.parent : null,
		node: display,
		name: display.name,
		uuid: display.uuid,
		block: display.block,
		scale: 1,
		config: display.config,
	}

	rig.nodeMap[display.uuid] = renderedBone
	return {
		uuid: display.uuid,
		children: [],
	}
}

function renderTextDisplay(display: TextDisplay, rig: IRenderedRig): INodeStructure | undefined {
	if (!display.export) return
	const parentId = (display.parent instanceof Group ? display.parent.uuid : display.parent)!

	const path = PathModule.join(rig.modelExportFolder, display.name + `.json`)
	const parsed = parseResourcePackPath(path)

	if (!parsed) {
		console.error(display)
		throw new Error(`Invalid bone path: ${display.name} -> ${path}`)
	}

	const renderedBone: IRenderedNodes['TextDisplay'] = {
		type: 'text_display',
		parent: parentId,
		parentNode: display.parent instanceof Group ? display.parent : null,
		node: display,
		name: display.name,
		uuid: display.uuid,
		text: JsonText.fromString(display.text),
		lineWidth: display.lineWidth,
		backgroundColor: display.backgroundColor,
		backgroundAlpha: display.backgroundAlpha,
		align: display.align,
		scale: 1,
		config: display.config,
	}

	rig.nodeMap[display.uuid] = renderedBone
	return {
		uuid: display.uuid,
		children: [],
	}
}

function renderLocator(locator: Locator, rig: IRenderedRig): INodeStructure {
	const parentId = (locator.parent instanceof Group ? locator.parent.uuid : locator.parent)!

	const renderedLocator: IRenderedNodes['Locator'] = {
		type: 'locator',
		parent: parentId,
		parentNode: locator.parent instanceof Group ? locator.parent : null,
		node: locator,
		name: locator.name,
		uuid: locator.uuid,
		config: locator.config,
	}

	rig.nodeMap[locator.uuid] = renderedLocator
	return {
		uuid: locator.uuid,
		children: [],
	}
}

function renderCamera(camera: ICamera, rig: IRenderedRig): INodeStructure {
	const parentId = (camera.parent instanceof Group ? camera.parent.uuid : camera.parent)!

	const renderedCamera: IRenderedNodes['Camera'] = {
		type: 'camera',
		parent: parentId,
		parentNode: camera.parent instanceof Group ? camera.parent : null,
		node: camera,
		name: camera.name,
		uuid: camera.uuid,
		config: camera.config,
	}

	rig.nodeMap[camera.uuid] = renderedCamera
	return {
		uuid: camera.uuid,
		children: [],
	}
}

function renderVariantModels(variant: Variant, rig: IRenderedRig) {
	const bones: Record<string, IRenderedBoneVariant> = {}

	for (const [uuid, bone] of Object.entries(rig.nodeMap)) {
		if (bone.type !== 'bone') continue
		if (variant.excludedNodes.find(v => v.value === uuid)) continue
		const textures: IRenderedModel['textures'] = {}

		for (const [fromUUID, toUUID] of variant.textureMap.map.entries()) {
			const fromTexture = Texture.all.find(t => t.uuid === fromUUID)
			if (!fromTexture) throw new Error(`From texture not found: ${fromUUID}`)
			if (toUUID === TRANSPARENT_TEXTURE.uuid) {
				textures[fromTexture.id] = TRANSPARENT_TEXTURE_RESOURCE_LOCATION
				rig.textures[TRANSPARENT_TEXTURE.id] = TRANSPARENT_TEXTURE
			} else {
				const toTexture = Texture.all.find(t => t.uuid === toUUID)
				if (!toTexture) throw new Error(`To texture not found: ${toUUID}`)
				textures[fromTexture.id] = getTextureResourceLocation(
					toTexture,
					rig
				).resourceLocation
				rig.textures[toTexture.id] = toTexture
			}
		}

		const parsed = PathModule.parse(bone.modelPath)
		const modelPath = PathModule.join(parsed.dir, variant.name, `${bone.name}.json`)
		const parsedModelPath = parseResourcePackPath(modelPath)
		if (!parsedModelPath) throw new Error(`Invalid variant model path: ${modelPath}`)

		// Don't export models without any texture changes
		if (Object.keys(textures).length === 0) continue

		bones[uuid] = {
			model: {
				parent: bone.resourceLocation,
				textures,
			},
			customModelData: -1,
			modelPath,
			resourceLocation: parsedModelPath.resourceLocation,
		}
	}

	return bones
}

function getDefaultPose(rig: IRenderedRig) {
	const anim = new Blockbench.Animation()
	correctSceneAngle()
	updatePreview(anim, 0)
	rig.defaultTransforms = getNodeTransforms(anim, rig.nodeMap)
	restoreSceneAngle()
}

export function hashRig(rig: IRenderedRig) {
	const hash = crypto.createHash('sha256')
	for (const [nodeUuid, node] of Object.entries(rig.nodeMap)) {
		hash.update('node;')
		hash.update(nodeUuid)
		hash.update(node.name)
		switch (node.type) {
			case 'bone': {
				if (node.configs.default) {
					const defaultConfig = BoneConfig.fromJSON(node.configs.default)
					if (!defaultConfig.isDefault()) {
						hash.update('defaultconfig;')
						hash.update(defaultConfig.toNBT().toString())
					}
				}
				for (const [variantName, config] of Object.entries(node.configs.variants)) {
					const variantConfig = BoneConfig.fromJSON(config)
					if (!variantConfig.isDefault()) {
						hash.update('variantconfig;')
						hash.update(variantName)
						hash.update(variantConfig.toNBT().toString())
					}
				}
				break
			}
			case 'locator': {
				if (node.config) {
					hash.update(';' + JSON.stringify(node.config))
				}
				break
			}
			case 'camera': {
				if (node.config) {
					hash.update(';' + JSON.stringify(node.config))
				}
				break
			}
			case 'text_display': {
				hash.update(`;${node.text?.toString() as string}`)
				if (node.config) {
					hash.update(';' + JSON.stringify(node.config))
				}
				break
			}
		}
	}
	return hash.digest('hex')
}

export function renderRig(modelExportFolder: string, textureExportFolder: string): IRenderedRig {
	console.time('Rendering rig took')
	Texture.all.forEach((t, i) => (t.id = String(i)))

	Animator.showDefaultPose()

	const structure: INodeStructure = {
		uuid: 'root',
		children: [],
	}

	const rig: IRenderedRig = {
		models: {},
		variantModels: {},
		nodeMap: {},
		nodeStructure: structure,
		textures: {},
		defaultTransforms: [],
		modelExportFolder,
		textureExportFolder,
		includesCustomModels: false,
	}

	for (const node of Outliner.root) {
		switch (true) {
			case node instanceof Group: {
				const bone = renderGroup(node, rig)
				if (bone) structure.children.push(bone)
				break
			}
			case node instanceof Locator: {
				const locator = renderLocator(node, rig)
				if (locator) structure.children.push(locator)
				break
			}
			case node instanceof TextDisplay: {
				const textDisplay = renderTextDisplay(node, rig)
				if (textDisplay) structure.children.push(textDisplay)
				break
			}
			case OutlinerElement.types.camera && node instanceof OutlinerElement.types.camera: {
				const camera = renderCamera(node as ICamera, rig)
				if (camera) structure.children.push(camera)
				break
			}
			case node instanceof VanillaItemDisplay: {
				const display = renderItemDisplay(node, rig)
				if (display) structure.children.push(display)
				break
			}
			case node instanceof VanillaBlockDisplay: {
				const display = renderBlockDisplay(node, rig)
				if (display) structure.children.push(display)
				break
			}
			case node instanceof Cube: {
				throw new IntentionalExportError(
					`Cubes cannot be exported as root nodes. Please parent them to a bone. (Found '${node.name}' outside of a bone)`
				)
			}
			default:
				console.warn(`Encountered unknown node type:`, node)
		}
	}

	getDefaultPose(rig)

	for (const variant of Variant.all) {
		if (variant.isDefault) continue // Don't export the default variant, it's redundant data.
		rig.variantModels[variant.uuid] = renderVariantModels(variant, rig)
	}

	TEXTURE_RESOURCE_LOCATION_CACHE.clear()

	console.timeEnd('Rendering rig took')
	console.log('Rendered rig:', rig)
	return rig
}
