<script lang="ts" context="module">
	import { Valuable } from '../util/stores'
	import { translate } from '../util/translation'
	import { resolveEnvVariables } from '../util/misc'
	import { MINECRAFT_REGISTRY } from '../systems/minecraft/registryManager'

	import Checkbox from './dialogItems/checkbox.svelte'
	import NumberSlider from './dialogItems/numberSlider.svelte'
	import LineInput from './dialogItems/lineInput.svelte'
	import Vector2D from './dialogItems/vector2d.svelte'
	import SectionHeader from './dialogItems/sectionHeader.svelte'
	import FileSelect from './dialogItems/fileSelect.svelte'
	import FolderSelect from './dialogItems/folderSelect.svelte'
	import CodeInput from './dialogItems/codeInput.svelte'
	import Select from './dialogItems/select.svelte'
	import { DIALOG_ID } from '../interface/animationPropertiesDialog'

	import HeartIcon from '../assets/heart.png'
	import KoFiImage from '../assets/kofi_s_tag_white.webp'

	import fontUrl from '../assets/MinecraftFull.ttf'
	if (![...document.fonts.keys()].some(v => v.family === 'MinecraftFull')) {
		void new FontFace('MinecraftFull', fontUrl, {}).load().then(font => {
			document.fonts.add(font)
		})
	}

	localStorage.setItem('animated_java_settings_support_me_popup', 'true')
</script>

<script lang="ts">
	export let blueprintName: Valuable<string>
	export let textureSizeX: Valuable<number>
	export let textureSizeY: Valuable<number>
	// Export Settings
	export let exportNamespace: Valuable<string>
	export let enablePluginMode: Valuable<boolean>
	export let resourcePackExportMode: Valuable<string>
	export let dataPackExportMode: Valuable<string>
	// Bounding Box
	export let showBoundingBox: Valuable<boolean>
	export let autoBoundingBox: Valuable<boolean>
	export let boundingBoxX: Valuable<number>
	export let boundingBoxY: Valuable<number>
	// Resource Pack Settings
	export let displayItem: Valuable<string>
	export let customModelDataOffset: Valuable<number>
	export let enableAdvancedResourcePackSettings: Valuable<boolean>
	export let resourcePack: Valuable<string>
	export let displayItemPath: Valuable<string>
	export let modelFolder: Valuable<string>
	export let textureFolder: Valuable<string>
	// Data Pack Settings
	export let enableAdvancedDataPackSettings: Valuable<boolean>
	export let dataPack: Valuable<string>
	export let summonCommands: Valuable<string>
	export let interpolationDuration: Valuable<number>
	export let teleportationDuration: Valuable<number>
	export let useStorageForAnimation: Valuable<boolean>
	// Plugin Export Settings
	export let bakedAnimations: Valuable<boolean>
	export let jsonFile: Valuable<string>

	function exportNamespaceChecker(value: string): { type: string; message: string } {
		if (value === '') {
			return {
				type: 'error',
				message: translate('dialog.blueprint_settings.export_namespace.error.empty'),
			}
		} else if (value.trim().match('[^a-zA-Z0-9_]')) {
			return {
				type: 'error',
				message: translate(
					'dialog.blueprint_settings.export_namespace.error.invalid_characters',
				),
			}
		} else if (['global', 'animated_java'].includes(value)) {
			return {
				type: 'error',
				message: translate(
					'dialog.blueprint_settings.export_namespace.error.reserved',
					value,
				),
			}
		} else {
			return { type: 'success', message: '' }
		}
	}

	function displayItemChecker(value: string): { type: string; message: string } {
		if (value === '') {
			return {
				type: 'error',
				message: translate('dialog.blueprint_settings.display_item.error.no_item_selected'),
			}
		} else if (value.split(':').length !== 2) {
			return {
				type: 'error',
				message: translate(
					'dialog.blueprint_settings.display_item.error.invalid_item_id.no_namespace',
				),
			}
		} else if (value.includes(' ')) {
			return {
				type: 'error',
				message: translate(
					'dialog.blueprint_settings.display_item.error.invalid_item_id.whitespace',
				),
			}
		} else if (
			MINECRAFT_REGISTRY.item &&
			!MINECRAFT_REGISTRY.item.has(value.replace('minecraft:', ''))
		) {
			return {
				type: 'warning',
				message: translate(
					'dialog.blueprint_settings.display_item.warning.item_does_not_exist',
				),
			}
		} else {
			return { type: 'success', message: '' }
		}
	}

	function textureSizeChecker(value: { x: number; y: number }): {
		type: string
		message: string
	} {
		const x = Number(value.x)
		const y = Number(value.y)
		const largestHeight: number = Number(
			Texture.all.map(t => t.height).reduce((max, cur) => Math.max(max, cur), 0),
		)
		const largestWidth: number = Number(
			Texture.all.map(t => t.width).reduce((max, cur) => Math.max(max, cur), 0),
		)

		if (!(x === largestWidth && y === largestHeight)) {
			return {
				type: 'warning',
				message: translate(
					'dialog.blueprint_settings.texture_size.warning.does_not_match_largest_texture',
				),
			}
		} else if (x !== y) {
			return {
				type: 'warning',
				message: translate('dialog.blueprint_settings.texture_size.warning.not_square'),
			}
		} else if (x !== 2 ** Math.floor(Math.log2(x)) || y !== 2 ** Math.floor(Math.log2(y))) {
			return {
				type: 'warning',
				message: translate(
					'dialog.blueprint_settings.texture_size.warning.not_a_power_of_2',
				),
			}
		} else {
			return {
				type: 'success',
				message: '',
			}
		}
	}

	function dataPackFolderChecker(value: string): { type: string; message: string } {
		value = resolveEnvVariables(value)
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.data_pack.error.no_folder_selected',
					),
				}
			case !fs.existsSync(value):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.data_pack.error.folder_does_not_exist',
					),
				}
			case !fs.statSync(value).isDirectory():
				return {
					type: 'error',
					message: translate('dialog.blueprint_settings.data_pack.error.not_a_folder'),
				}
			case !fs.existsSync(PathModule.join(value, 'pack.mcmeta')):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.data_pack.error.missing_pack_mcmeta',
					),
				}
			case !fs.existsSync(PathModule.join(value, 'data')):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.data_pack.error.missing_data_folder',
					),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	function resourcePackFolderChecker(value: string): { type: string; message: string } {
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack.error.no_folder_selected',
					),
				}
			case !fs.existsSync(value):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack.error.folder_does_not_exist',
					),
				}
			case !fs.statSync(value).isDirectory():
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack.error.not_a_folder',
					),
				}
			case !fs.existsSync(PathModule.join(value, 'pack.mcmeta')):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack.error.missing_pack_mcmeta',
					),
				}
			case !fs.existsSync(PathModule.join(value, 'assets')):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack.error.missing_assets_folder',
					),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	function advancedResourcePackFileChecker(value: string): { type: string; message: string } {
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_file.error.no_file_selected',
					),
				}
			case !fs.existsSync(value):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_file.error.file_does_not_exist',
					),
				}
			case !fs.statSync(value).isFile():
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_file.error.not_a_file',
					),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	function jsonFileChecker(value: string): { type: string; message: string } {
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.json_file.error.no_file_selected',
					),
				}
			case fs.existsSync(value) && !fs.statSync(value).isFile():
				return {
					type: 'error',
					message: translate('dialog.blueprint_settings.json_file.error.not_a_file'),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	function advancedResourcePackFolderChecker(value: string): { type: string; message: string } {
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_folder.error.no_folder_selected',
					),
				}
			case !fs.existsSync(value):
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_folder.error.folder_does_not_exist',
					),
				}
			case !fs.statSync(value).isDirectory():
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.advanced_resource_pack_folder.error.not_a_folder',
					),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	function zipChecker(value: string): { type: string; message: string } {
		switch (true) {
			case value === '':
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack_zip.error.no_file_selected',
					),
				}
			case fs.existsSync(value) && !fs.statSync(value).isFile():
				return {
					type: 'error',
					message: translate(
						'dialog.blueprint_settings.resource_pack_zip.error.not_a_file',
					),
				}
			default:
				return { type: 'success', message: '' }
		}
	}

	let showSupportMePopup =
		localStorage.getItem('animated_java_settings_support_me_popup') === 'true'
	function clickSupportMeXButton() {
		localStorage.setItem('animated_java_settings_support_me_popup', 'false')
		showSupportMePopup = false
	}

	function hoverCloseButton(e: MouseEvent) {
		;(e.target as HTMLElement).textContent = 'sentiment_sad'
	}
	function leaveCloseButton(e: MouseEvent) {
		;(e.target as HTMLElement).textContent = 'close'
	}
</script>

<div style="--aj-dialog-id: '{DIALOG_ID}';" />

<div>
	<LineInput
		label={translate('dialog.blueprint_settings.blueprint_name.title')}
		tooltip={translate('dialog.blueprint_settings.blueprint_name.description')}
		bind:value={blueprintName}
	/>

	<Vector2D
		label={translate('dialog.blueprint_settings.texture_size.title')}
		tooltip={translate('dialog.blueprint_settings.texture_size.description')}
		bind:valueX={textureSizeX}
		minX={2}
		maxX={4096}
		bind:valueY={textureSizeY}
		minY={2}
		maxY={4096}
		valueChecker={textureSizeChecker}
	/>

	<Checkbox
		label={translate('dialog.blueprint_settings.show_bounding_box.title')}
		tooltip={translate('dialog.blueprint_settings.show_bounding_box.description')}
		bind:checked={showBoundingBox}
	/>

	<Checkbox
		label={translate('dialog.blueprint_settings.auto_bounding_box.title')}
		tooltip={translate('dialog.blueprint_settings.auto_bounding_box.description')}
		bind:checked={autoBoundingBox}
	/>

	{#if !$autoBoundingBox}
		<Vector2D
			label={translate('dialog.blueprint_settings.bounding_box.title')}
			tooltip={translate('dialog.blueprint_settings.bounding_box.description')}
			bind:valueX={boundingBoxX}
			minX={2}
			maxX={4096}
			bind:valueY={boundingBoxY}
			minY={2}
			maxY={4096}
		/>
	{/if}

	<SectionHeader label={translate('dialog.blueprint_settings.export_settings.title')} />

	<LineInput
		label={translate('dialog.blueprint_settings.export_namespace.title')}
		tooltip={translate('dialog.blueprint_settings.export_namespace.description')}
		bind:value={exportNamespace}
		valueChecker={exportNamespaceChecker}
	/>

	<Checkbox
		label={translate('dialog.blueprint_settings.enable_plugin_mode.title')}
		tooltip={translate('dialog.blueprint_settings.enable_plugin_mode.description')}
		bind:checked={enablePluginMode}
	/>

	{#if $enablePluginMode}
		<LineInput
			label={translate('dialog.blueprint_settings.display_item.title')}
			tooltip={translate('dialog.blueprint_settings.display_item.description')}
			bind:value={displayItem}
			valueChecker={displayItemChecker}
		/>

		<Checkbox
			label={translate('dialog.blueprint_settings.baked_animations.title')}
			tooltip={translate('dialog.blueprint_settings.baked_animations.description')}
			bind:checked={bakedAnimations}
		/>

		<FileSelect
			label={translate('dialog.blueprint_settings.json_file.title')}
			tooltip={translate('dialog.blueprint_settings.json_file.description')}
			bind:value={jsonFile}
			valueChecker={jsonFileChecker}
		/>
	{:else}
		<Select
			label={translate('dialog.blueprint_settings.resource_pack_export_mode.title')}
			tooltip={translate('dialog.blueprint_settings.resource_pack_export_mode.description')}
			options={{
				raw: translate('dialog.blueprint_settings.resource_pack_export_mode.options.raw'),
				zip: translate('dialog.blueprint_settings.resource_pack_export_mode.options.zip'),
				none: translate('dialog.blueprint_settings.resource_pack_export_mode.options.none'),
			}}
			defaultOption={'raw'}
			bind:value={resourcePackExportMode}
		/>

		<Select
			label={translate('dialog.blueprint_settings.data_pack_export_mode.title')}
			tooltip={translate('dialog.blueprint_settings.data_pack_export_mode.description')}
			options={{
				raw: translate('dialog.blueprint_settings.data_pack_export_mode.options.raw'),
				zip: translate('dialog.blueprint_settings.data_pack_export_mode.options.zip'),
				none: translate('dialog.blueprint_settings.data_pack_export_mode.options.none'),
			}}
			defaultOption={'raw'}
			bind:value={dataPackExportMode}
		/>

		{#if $resourcePackExportMode !== 'none'}
			<SectionHeader
				label={translate('dialog.blueprint_settings.resource_pack_settings.title')}
			/>
			{#if $resourcePackExportMode === 'raw'}
				<Checkbox
					label={translate(
						'dialog.blueprint_settings.enable_advanced_resource_pack_settings.title',
					)}
					bind:checked={enableAdvancedResourcePackSettings}
				/>
				{#if $enableAdvancedResourcePackSettings}
					<p class="warning">
						{translate('dialog.blueprint_settings.advanced_settings_warning')}
					</p>
					<LineInput
						label={translate('dialog.blueprint_settings.display_item.title')}
						tooltip={translate('dialog.blueprint_settings.display_item.description')}
						bind:value={displayItem}
						valueChecker={displayItemChecker}
					/>

					<NumberSlider
						label={translate(
							'dialog.blueprint_settings.custom_model_data_offset.title',
						)}
						tooltip={translate(
							'dialog.blueprint_settings.custom_model_data_offset.description',
						)}
						bind:value={customModelDataOffset}
					/>

					<FileSelect
						label={translate('dialog.blueprint_settings.display_item_path.title')}
						tooltip={translate(
							'dialog.blueprint_settings.display_item_path.description',
						)}
						bind:value={displayItemPath}
						valueChecker={advancedResourcePackFileChecker}
					/>

					<FolderSelect
						label={translate('dialog.blueprint_settings.model_folder.title')}
						tooltip={translate('dialog.blueprint_settings.model_folder.description')}
						bind:value={modelFolder}
						valueChecker={advancedResourcePackFolderChecker}
					/>

					<FolderSelect
						label={translate('dialog.blueprint_settings.texture_folder.title')}
						tooltip={translate('dialog.blueprint_settings.texture_folder.description')}
						bind:value={textureFolder}
						valueChecker={advancedResourcePackFolderChecker}
					/>
				{:else}
					<LineInput
						label={translate('dialog.blueprint_settings.display_item.title')}
						tooltip={translate('dialog.blueprint_settings.display_item.description')}
						bind:value={displayItem}
						valueChecker={displayItemChecker}
					/>

					<NumberSlider
						label={translate(
							'dialog.blueprint_settings.custom_model_data_offset.title',
						)}
						tooltip={translate(
							'dialog.blueprint_settings.custom_model_data_offset.description',
						)}
						bind:value={customModelDataOffset}
						min={0}
						max={2147483647}
					/>

					<FolderSelect
						label={translate('dialog.blueprint_settings.resource_pack.title')}
						tooltip={translate('dialog.blueprint_settings.resource_pack.description')}
						bind:value={resourcePack}
						valueChecker={resourcePackFolderChecker}
					/>
				{/if}
			{:else if $resourcePackExportMode === 'zip'}
				<FileSelect
					label={translate('dialog.blueprint_settings.resource_pack_zip.title')}
					tooltip={translate('dialog.blueprint_settings.resource_pack_zip.description')}
					bind:value={resourcePack}
					valueChecker={zipChecker}
				/>
			{/if}
		{/if}

		{#if $dataPackExportMode !== 'none'}
			<SectionHeader
				label={translate('dialog.blueprint_settings.data_pack_settings.title')}
			/>
			{#if $dataPackExportMode === 'raw'}
				{#if $enableAdvancedDataPackSettings}
					<p class="warning">
						{translate('dialog.blueprint_settings.advanced_settings_warning')}
					</p>

					<FolderSelect
						label={translate('dialog.blueprint_settings.data_pack.title')}
						tooltip={translate('dialog.blueprint_settings.data_pack.description')}
						bind:value={dataPack}
						valueChecker={dataPackFolderChecker}
					/>
				{:else}
					<FolderSelect
						label={translate('dialog.blueprint_settings.data_pack.title')}
						tooltip={translate('dialog.blueprint_settings.data_pack.description')}
						bind:value={dataPack}
						valueChecker={dataPackFolderChecker}
					/>
				{/if}
			{:else if $dataPackExportMode === 'zip'}
				<FileSelect
					label={translate('dialog.blueprint_settings.data_pack_zip.title')}
					tooltip={translate('dialog.blueprint_settings.data_pack_zip.description')}
					bind:value={dataPack}
					valueChecker={zipChecker}
				/>
			{/if}
			<CodeInput
				label={translate('dialog.blueprint_settings.summon_commands.title')}
				tooltip={translate('dialog.blueprint_settings.summon_commands.description')}
				bind:value={summonCommands}
			/>

			<NumberSlider
				label={translate('dialog.blueprint_settings.interpolation_duration.title')}
				tooltip={translate('dialog.blueprint_settings.interpolation_duration.description')}
				bind:value={interpolationDuration}
				min={0}
				max={2147483647}
			/>

			<NumberSlider
				label={translate('dialog.blueprint_settings.teleportation_duration.title')}
				tooltip={translate('dialog.blueprint_settings.teleportation_duration.description')}
				bind:value={teleportationDuration}
				min={0}
				max={2147483647}
			/>

			<Checkbox
				label={translate('dialog.blueprint_settings.use_storage_for_animation.title')}
				tooltip={translate(
					'dialog.blueprint_settings.use_storage_for_animation.description',
				)}
				bind:checked={useStorageForAnimation}
			/>
		{/if}
	{/if}
</div>

{#if showSupportMePopup}
	<div class="ko-fi-popup-container">
		<div class="ko-fi-popup">
			<div class="title">
				<img class="heart" src={HeartIcon} alt="❤️" />
				<span>Animated Java?</span>
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<i
					class="material-icons icon"
					on:click={clickSupportMeXButton}
					on:mouseenter={hoverCloseButton}
					on:mouseleave={leaveCloseButton}
				>
					close
				</i>
			</div>
			<a href="https://ko-fi.com/snavesutit" class="ko-fi-button">
				<img src={KoFiImage} alt="" />
			</a>
		</div>
		<div class="shadow" />
	</div>
{/if}

<style>
	i {
		cursor: pointer;
		height: fit-content;
		transition:
			transform 0.2s ease 0s,
			color 0.2s ease 0s;
		text-shadow: 1.5px 1.5px 0px rgba(0, 0, 0, 0.25);
	}
	i:hover {
		transform: scale(1.25);
	}

	.ko-fi-popup-container {
		position: absolute;
		top: 30px;
		right: -287px;
		font-family: 'MinecraftFull';
		font-size: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		color: white;
		overflow: hidden;
	}
	.ko-fi-popup {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		padding: 8px;
		padding-right: 0px;

		background-color: #00aced;
		border-radius: 0 8px 8px 0;
		box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.2);
		animation: slideIn 0.75s;
	}
	.heart {
		width: 28px;
		height: 28px;
		animation: beat 2s ease infinite;
	}
	@keyframes beat {
		0% {
			transform: scale(1);
		}
		10% {
			transform: scale(1.2);
		}
		20% {
			transform: scale(1);
		}
	}
	.ko-fi-popup span {
		text-shadow: 2.4px 2.4px 0px rgba(0, 0, 0, 0.25);
	}
	.ko-fi-button img {
		width: 100%;
		image-rendering: auto;
		border-radius: 12px;
	}
	.ko-fi-button {
		width: 250px;
		margin-right: 8px;
		margin-top: 12px;
		transition: transform 0.2s ease;
	}
	.ko-fi-button:hover {
		transform: scale(1.05);
		transition: transform 0.2s ease;
	}
	.ko-fi-popup .title {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
	}
	.shadow {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(90deg, #00000066, #00000000);
		width: 0px;
	}
	@keyframes slideIn {
		0% {
			right: 287px;
		}
		100% {
			right: 0;
		}
	}
	@keyframes slideInPanel {
		0% {
			right: 0;
		}
		100% {
			right: -287px;
		}
	}

	:global(dialog#animated_java\:blueprintSettingsDialog .dialog_wrapper .dialog_content) {
		overflow-y: auto !important;
	}
	div {
		padding-right: 8px;
		max-height: 50rem;
	}
	.warning {
		color: var(--color-warning);
		font-family: var(--font-code);
		font-size: 0.8em;
		margin-bottom: 8px;
	}
</style>
