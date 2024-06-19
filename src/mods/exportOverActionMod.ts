import { BLUEPRINT_CODEC, BLUEPRINT_FORMAT } from '../blueprintFormat'
import { PACKAGE } from '../constants'
import { createBlockbenchMod } from '../util/moddingTools'

createBlockbenchMod(
	`${PACKAGE.name}:exportOverAction`,
	{
		action: BarItems.export_over as Action,
		originalClick: (BarItems.export_over as Action).click,
	},
	context => {
		context.action.click = (event: Event) => {
			if (!Project || !Format) return
			if (Format.id === BLUEPRINT_FORMAT.id) {
				if (Project.save_path || Project.export_path) {
					Project.save_path = Project.save_path || Project.export_path
				}
				BLUEPRINT_CODEC.export()
			} else {
				context.originalClick.call(context.action, event)
			}
		}
		return context
	},
	context => {
		context.action.click = context.originalClick
	}
)
