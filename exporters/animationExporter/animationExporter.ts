// @ts-ignore
import en from './lang/en.yaml'

type IFrameLeaf = AnimatedJava.ITreeLeaf<AnimatedJava.IRenderedAnimation['frames'][any]>
type IFrameBranch = AnimatedJava.ITreeBranch<AnimatedJava.IRenderedAnimation['frames'][any]>
type IFrameTree = IFrameBranch | IFrameLeaf

export function loadExporter() {
	const API = AnimatedJava.API
	const { NbtCompound, NbtString, NbtList, NbtInt, NbtFloat } = AnimatedJava.API.deepslate

	API.addTranslations('en', en as Record<string, string>)

	const TRANSLATIONS = {
		datapack_folder: {
			name: API.translate('animated_java.animation_exporter.settings.datapack_folder'),
			description: API.translate(
				'animated_java.animation_exporter.settings.datapack_folder.description'
			).split('\n'),
			error: {
				unset: API.translate(
					'animated_java.animation_exporter.settings.datapack_folder.error.unset'
				),
			},
		},
		interpolation_duration: {
			name: API.translate('animated_java.animation_exporter.settings.interpolation_duration'),
			description: API.translate(
				'animated_java.animation_exporter.settings.interpolation_duration.description'
			).split('\n'),
		},
	}

	async function fileExists(path: string) {
		return !!(await fs.promises.stat(path).catch(() => false))
	}

	function matrixToNbt(matrix: number[]) {
		return new NbtList(matrix.map(v => new NbtFloat(v)))
	}

	new API.Exporter({
		id: 'animated_java:animation_exporter',
		name: API.translate('animated_java.animation_exporter.name'),
		description: API.translate('animated_java.animation_exporter.description'),
		getSettings() {
			return {
				datapack_folder: new API.Settings.FolderSetting(
					{
						id: 'animated_java:animation_exporter/datapack_folder',
						displayName: TRANSLATIONS.datapack_folder.name,
						description: TRANSLATIONS.datapack_folder.description,
						defaultValue: '',
					},
					function onUpdate(setting) {
						if (!setting.value) {
							setting.infoPopup = API.createInfo(
								'error',
								TRANSLATIONS.datapack_folder.error.unset
							)
						}
					}
				),
				interpolation_duration: new API.Settings.NumberSetting({
					id: 'animated_java:animation_exporter/interpolation_duration',
					displayName: TRANSLATIONS.interpolation_duration.name,
					description: TRANSLATIONS.interpolation_duration.description,
					defaultValue: 1,
					min: 0,
					step: 1,
					resettable: true,
				}),
			}
		},
		settingsStructure: [
			{
				type: 'setting',
				settingId: 'animated_java:animation_exporter/datapack_folder',
			},
			{
				type: 'setting',
				settingId: 'animated_java:animation_exporter/interpolation_duration',
			},
		],
		async export(ajSettings, projectSettings, exporterSettings, renderedAnimations, rig) {
			if (!Project?.animated_java_variants) throw new Error('No variants found')
			console.log(ajSettings, projectSettings, exporterSettings, renderedAnimations, rig)
			//--------------------------------------------
			// Settings
			//--------------------------------------------
			const NAMESPACE = projectSettings.project_namespace.value
			const RIG_ITEM = projectSettings.rig_item.value
			const EXPORT_FOLDER = exporterSettings.datapack_folder.value
			const variants = Project.animated_java_variants.variants

			//--------------------------------------------
			// Data Pack
			//--------------------------------------------

			const scoreboard = {
				i: 'aj.i',
				id: 'aj.id',
				animTime: 'aj.anim_time',
				life_time: 'aj.life_time',
			}
			const tags = {
				new: 'aj.new',
				root_entity: `aj.${NAMESPACE}.root`,
				bone_entity: `aj.${NAMESPACE}.bone.%s`,
				activeAnim: `aj.${NAMESPACE}.animations.%s`,
			}
			const entity_types = {
				aj_root: `#${NAMESPACE}:aj_root`,
				aj_bone: `#${NAMESPACE}:aj_bone`,
			}

			const datapack = new API.VirtualFileSystem.VirtualFolder(NAMESPACE)
			const dataFolder = datapack.newFolder('data')

			datapack
				.chainNewFile('animated_java.mcmeta', {
					project_namespace: NAMESPACE,
				})
				.chainNewFile('pack.mcmeta', {
					pack: {
						pack_format: 12, // 12 since 1.19.4
						description: `"${NAMESPACE}" A Data Pack generated by Animated Java using the Animation Exporter.`,
					},
				})

			const [namespaceFolder, animatedJavaFolder] = dataFolder.newFolders(
				NAMESPACE,
				`zzz_${NAMESPACE}_internal`
			)
			namespaceFolder.newFolders('functions', 'tags')
			animatedJavaFolder.newFolders('functions', 'tags', 'item_modifiers')
			const AJ_NAMESPACE = animatedJavaFolder.name

			//--------------------------------------------
			// minecraft function tags
			//--------------------------------------------

			const functionTagFolder = dataFolder.newFolder('minecraft/tags/functions')
			functionTagFolder.newFile('load.json', {
				replace: false,
				values: [`${AJ_NAMESPACE}:load`],
			})
			functionTagFolder.newFile('tick.json', {
				replace: false,
				values: [`${AJ_NAMESPACE}:tick`],
			})

			//--------------------------------------------
			// entity_type tags
			//--------------------------------------------

			namespaceFolder
				.newFolder('tags/entity_types')
				.chainNewFile('aj_root.json', {
					replace: false,
					values: ['minecraft:item_display'],
				})
				.chainNewFile('aj_bone.json', {
					replace: false,
					values: ['minecraft:item_display'],
				})

			//--------------------------------------------
			// function tags
			//--------------------------------------------

			namespaceFolder
				.newFolder('tags/functions')
				.chainNewFile('on_summon.json', {
					replace: false,
					values: [],
				})
				.chainNewFile('on_tick.json', {
					replace: false,
					values: [],
				})
				.chainNewFile('on_remove.json', {
					replace: false,
					values: [],
				})

			//--------------------------------------------
			// warning messages
			//--------------------------------------------

			const errorMustBeRunAsRoot = new API.JsonText([
				'',
				{ text: '[' },
				{ text: 'Animated Java', color: 'aqua' },
				{ text: '] ' },
				{ text: 'ERROR ☠', color: 'red' },
				{ text: ' > ', color: 'gray' },
				[
					{ text: 'The function', color: 'yellow' },
					{ text: ' %s ', color: 'blue' },
					{ text: 'must be run' },
					{ text: ' as ', color: 'red' },
					{ text: 'the root entity!' },
				],
			])

			//--------------------------------------------
			// load/tick functions
			//--------------------------------------------

			animatedJavaFolder
				.accessFolder('functions')
				.chainNewFile('load.mcfunction', [
					...Object.values(scoreboard).map(s => `scoreboard objectives add ${s} dummy`),
					`scoreboard players add .aj.last_id ${scoreboard.id} 0`,
				])
				.chainNewFile('tick.mcfunction', [
					`execute as @e[type=${entity_types.aj_root},tag=${tags.root_entity}] run function ${AJ_NAMESPACE}:tick_as_root`,
				])
				.chainNewFile('tick_as_root.mcfunction', [
					`scoreboard players add @s ${scoreboard.life_time} 1`,
					`function ${AJ_NAMESPACE}:animations/tick`,
				])

			//--------------------------------------------
			// summon functions
			//--------------------------------------------

			const summonNbt = new NbtCompound()
			summonNbt.set(
				'Tags',
				new NbtList([new NbtString(tags.new), new NbtString(tags.root_entity)])
			)

			const passengers = new NbtList()
			for (const [uuid, bone] of Object.entries(rig.boneMap)) {
				const passenger = new NbtCompound()
					.set('id', new NbtString('minecraft:item_display'))
					.set(
						'Tags',
						new NbtList([
							new NbtString(tags.new),
							new NbtString(API.formatStr(tags.bone_entity, [bone.name])),
						])
					)
					.set(
						'item',
						new NbtCompound()
							.set('id', new NbtString(RIG_ITEM))
							.set('Count', new NbtInt(1))
							.set(
								'tag',
								new NbtCompound().set(
									'CustomModelData',
									new NbtInt(bone.customModelData)
								)
							)
					)
					.set(
						'transformation',
						matrixToNbt(rig.defaultPose.find(b => b.uuid === uuid)!.matrix)
					)
					.set(
						'interpolation_duration',
						new NbtInt(exporterSettings.interpolation_duration.value)
					)
				passengers.add(passenger)
			}
			summonNbt.set('Passengers', passengers)

			const variantSummonFolder = namespaceFolder
				.accessFolder('functions')
				.chainNewFile('summon.mcfunction', [
					`summon minecraft:item_display ~ ~ ~ ${summonNbt.toString()}`,
					`execute as @e[type=minecraft:item_display,limit=1,distance=..1,tag=${tags.new}] run function ${AJ_NAMESPACE}:summon/as_root`,
				])
				.newFolder('summon')

			for (const variant of variants) {
				if (variant.default) continue
				variantSummonFolder.newFile(`${variant.name}.mcfunction`, [
					`scoreboard players set .aj.variant_id ${scoreboard.i} ${variants.indexOf(
						variant
					)}`,
					`function ${NAMESPACE}:summon`,
				])
			}

			animatedJavaFolder
				.accessFolder('functions')
				.newFolder('summon')
				.chainNewFile('as_root.mcfunction', [
					`execute store result score @s ${scoreboard.id} run scoreboard players add .aj.last_id ${scoreboard.id} 1`,
					`execute on passengers run function ${AJ_NAMESPACE}:summon/as_bone`,
					`tag @s remove ${tags.new}`,
					`function #${NAMESPACE}:on_summon`,
				])
				.chainNewFile('as_bone.mcfunction', [
					`scoreboard players operation @s ${scoreboard.id} = .aj.last_id ${scoreboard.id}`,
				])

			//--------------------------------------------
			// remove functions
			//--------------------------------------------

			namespaceFolder
				.newFolder('functions/remove')
				.chainNewFile('this.mcfunction', [
					`execute if entity @s[tag=${tags.root_entity}] run function ${AJ_NAMESPACE}:remove/as_root`,
					`execute if entity @s[tag=!${tags.root_entity}] run tellraw @a ${API.formatStr(
						errorMustBeRunAsRoot.toString(),
						[`${NAMESPACE}:remove/this`]
					)}`,
				])
				.chainNewFile('all.mcfunction', [
					`execute as @e[type=#${NAMESPACE}:aj_root,tag=${tags.root_entity}] run function ${AJ_NAMESPACE}:remove/as_root`,
				])

			animatedJavaFolder
				.newFolder('functions/remove')
				.chainNewFile('as_root.mcfunction', [
					`execute at @s run function #${NAMESPACE}:on_remove`,
					`execute on passengers run kill @s`,
					`kill @s`,
				])

			//--------------------------------------------
			// animation functions
			//--------------------------------------------

			// Tree building helpers
			function getBranchFileName(branch: IFrameBranch) {
				return `branch_${branch.minScoreIndex}_${branch.maxScoreIndex}`
			}

			function getRootLeafFileName(frame: IFrameLeaf) {
				return `frame_${frame.scoreIndex}`
			}

			function getBoneLeafFileName(frame: IFrameLeaf) {
				return `frame_${frame.scoreIndex}_as_bone`
			}

			function generateRootLeafFunction(animName: string, leaf: IFrameLeaf) {
				const commands: string[] = []
				commands.push(
					`execute on passengers run function ${AJ_NAMESPACE}:animations/${animName}/frame_tree/${getBoneLeafFileName(
						leaf
					)}`
				)
				// TODO - Add command, variant, and animation state functionality here
				return commands
			}

			function generateBoneLeafFunction(leaf: IFrameLeaf) {
				const commands: string[] = []
				for (const bone of Object.values(leaf.item.bones)) {
					const data = new NbtCompound()
						.set('transformation', matrixToNbt(bone.matrix))
						.set('start_interpolation', new NbtInt(0))
					commands.push(
						`execute if entity @s[tag=${API.formatStr(tags.bone_entity, [
							bone.name,
						])}] run data modify entity @s {} merge value ${data}`
					)
				}
				return commands
			}

			function buildFrameTree(
				anim: AnimatedJava.IRenderedAnimation,
				frameTree: IFrameTree,
				applyFrameFolder: AnimatedJava.VirtualFolder
			) {
				function recurse(tree: IFrameTree): string {
					if (tree.type === 'branch') {
						const content: string[] = []
						for (const item of tree.items) {
							content.push(recurse(item))
						}
						applyFrameFolder.newFile(getBranchFileName(tree) + '.mcfunction', content)

						return `execute if score @s ${scoreboard.animTime} matches ${
							tree.minScoreIndex
						}..${tree.maxScoreIndex} run function ${AJ_NAMESPACE}:animations/${
							anim.name
						}/frame_tree/${getBranchFileName(tree)}`
					}

					applyFrameFolder.newFile(
						getRootLeafFileName(tree) + '.mcfunction',
						generateRootLeafFunction(anim.name, tree)
					)
					applyFrameFolder.newFile(
						getBoneLeafFileName(tree) + '.mcfunction',
						generateBoneLeafFunction(tree)
					)

					return `execute if score @s ${scoreboard.animTime} matches ${
						tree.scoreIndex
					} run function ${AJ_NAMESPACE}:animations/${
						anim.name
					}/frame_tree/${getRootLeafFileName(tree)}`
				}
				return recurse(frameTree)
			}

			// External functions
			for (const anim of renderedAnimations) {
				namespaceFolder
					.newFolder(`functions/animations/${anim.name}`)
					.chainNewFile('play.mcfunction', [
						`scoreboard players set @s ${scoreboard.animTime} 0`,
						`tag @s add ${API.formatStr(tags.activeAnim, [anim.name])}`,
					])
					.chainNewFile('resume.mcfunction', [
						`tag @s add ${API.formatStr(tags.activeAnim, [anim.name])}`,
					])
					.chainNewFile('pause.mcfunction', [
						`tag @s remove ${API.formatStr(tags.activeAnim, [anim.name])}`,
					])
					.chainNewFile('stop.mcfunction', [
						`scoreboard players set @s ${scoreboard.animTime} 0`,
						`tag @s remove ${API.formatStr(tags.activeAnim, [anim.name])}`,
					])
			}

			// Internal functions
			animatedJavaFolder
				.newFolder('functions/animations')
				.chainNewFile('tick.mcfunction', [
					...renderedAnimations.map(
						anim =>
							`execute if entity @s[tag=${API.formatStr(tags.activeAnim, [
								anim.name,
							])}] run function ${AJ_NAMESPACE}:animations/${anim.name}/tick`
					),
				])

			for (const anim of renderedAnimations) {
				const animFolder = animatedJavaFolder.newFolder(`functions/animations/${anim.name}`)

				animFolder
					.chainNewFile('tick.mcfunction', [
						`function ${AJ_NAMESPACE}:animations/${anim.name}/apply_frame`,
						`scoreboard players add @s ${scoreboard.animTime} 1`,
						`execute if score @s ${scoreboard.animTime} matches ${anim.duration} run function ${AJ_NAMESPACE}:animations/${anim.name}/end`,
					])
					.chainNewFile('end.mcfunction', [
						`scoreboard players set @s ${scoreboard.animTime} 0`,
					])

				const tree = API.generateSearchTree(anim.frames)
				console.log(tree)
				const frameTreeFolder = animFolder.newFolder('frame_tree')
				const applyFrameFile = animFolder.newFile(
					'apply_frame.mcfunction',
					buildFrameTree(anim, tree, frameTreeFolder)
				)
			}

			//--------------------------------------------
			// Export Data Pack
			//--------------------------------------------

			const DATAPACK_EXPORT_PATH = PathModule.join(EXPORT_FOLDER, NAMESPACE)
			const ajMetaPath = PathModule.join(DATAPACK_EXPORT_PATH, 'animated_java.mcmeta')

			const progress = new API.ProgressBarController(
				'Writing Data Pack to disk...',
				datapack.childCount
			)

			if (await fileExists(ajMetaPath)) {
				const content = await fs.promises.readFile(ajMetaPath, 'utf-8').then(JSON.parse)
				if (content.project_namespace !== NAMESPACE)
					throw new Error(
						`The datapack folder already contains a datapack with a different namespace: ${
							content.project_namespace as string
						}`
					)

				await fs.promises.rm(DATAPACK_EXPORT_PATH, { recursive: true })
			}

			await datapack.writeToDisk(EXPORT_FOLDER, change => progress.add(change))
			progress.finish()
		},
	})
}
