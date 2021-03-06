/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 */
import {
	select as d3Select,
	mouse as d3Mouse
} from "d3-selection";
import ChartInternal from "./ChartInternal";
import CLASS from "../config/classes";
import {extend, isFunction, isObject, isString, isValue, callFn, sanitise, tplProcess} from "./util";

extend(ChartInternal.prototype, {
	/**
	 * Initializes the tooltip
	 * @private
	 */
	initTooltip() {
		const $$ = this;
		const config = $$.config;
		const bindto = config.tooltip_contents.bindto;

		$$.tooltip = d3Select(bindto);

		if ($$.tooltip.empty()) {
			$$.tooltip = $$.selectChart
				.style("position", "relative")
				.append("div")
				.attr("class", CLASS.tooltipContainer)
				.style("position", "absolute")
				.style("pointer-events", "none")
				.style("display", "none");
		}

		// Show tooltip if needed
		if (config.tooltip_init_show) {
			if ($$.isTimeSeries() && isString(config.tooltip_init_x)) {
				const targets = $$.data.targets[0];
				let i;
				let val;

				config.tooltip_init_x = $$.parseDate(config.tooltip_init_x);

				for (i = 0; (val = targets.values[i]); i++) {
					if ((val.x - config.tooltip_init_x) === 0) {
						break;
					}
				}

				config.tooltip_init_x = i;
			}

			$$.tooltip.html($$.getTooltipHTML(
				$$.data.targets.map(d => $$.addName(d.values[config.tooltip_init_x])),
				$$.axis.getXAxisTickFormat(),
				$$.getYFormat($$.hasArcType(null, ["radar"])),
				$$.color
			));

			if (!bindto) {
				$$.tooltip.style("top", config.tooltip_init_position.top)
					.style("left", config.tooltip_init_position.left)
					.style("display", "block");
			}
		}
	},

	/**
	 * Get the tooltip HTML string
	 * @param  {...any} args
	 * @private
	 * @return {String} Formatted HTML string
	 */
	getTooltipHTML(...args) {
		const $$ = this;
		const config = $$.config;

		return isFunction(config.tooltip_contents) ?
			config.tooltip_contents.call($$, ...args) : $$.getTooltipContent(...args);
	},

	/**
	 * Returns the tooltip content(HTML string)
	 * @param {Object} d data
	 * @param {Function} defaultTitleFormat Default title format
	 * @param {Function} defaultValueFormat Default format for each data value in the tooltip.
	 * @param {Function} color Color function
	 * @returns {String} html
	 * @private
	 */
	getTooltipContent(d, defaultTitleFormat, defaultValueFormat, color) {
		const $$ = this;
		const config = $$.config;
		const titleFormat = config.tooltip_format_title || defaultTitleFormat;
		const nameFormat = config.tooltip_format_name || (name => name);
		const valueFormat = config.tooltip_format_value || ($$.isStackNormalized() ? ((v, ratio) => `${(ratio * 100).toFixed(2)}%`) : defaultValueFormat);
		const order = config.tooltip_order;
		const getRowValue = row => $$.getBaseValue(row);
		const getBgColor = $$.levelColor ? row => $$.levelColor(row.value) : row => color(row.id);
		const contents = config.tooltip_contents;
		const tplStr = contents.template;

		if (order === null && config.data_groups.length) {
			// for stacked data, order should aligned with the visually displayed data
			const ids = $$.orderTargets($$.data.targets)
				.map(i2 => i2.id)
				.reverse();

			d.sort((a, b) => {
				let v1 = a ? a.value : null;
				let v2 = b ? b.value : null;

				if (v1 > 0 && v2 > 0) {
					v1 = a.id ? ids.indexOf(a.id) : null;
					v2 = b.id ? ids.indexOf(b.id) : null;
				}

				return v1 - v2;
			});
		} else if (/^(asc|desc)$/.test(order)) {
			const isAscending = order === "asc";

			d.sort((a, b) => {
				const v1 = a ? getRowValue(a) : null;
				const v2 = b ? getRowValue(b) : null;

				return isAscending ? v1 - v2 : v2 - v1;
			});
		} else if (isFunction(order)) {
			d.sort(order);
		}

		const tpl = $$.getTooltipContentTemplate(tplStr);
		let text;
		let row;
		let param;
		let value;

		for (let i = 0; (row = d[i]); i++) {
			if (!(getRowValue(row) || getRowValue(row) === 0)) {
				continue;
			}

			if (i === 0) {
				const title = sanitise(titleFormat ? titleFormat(row.x) : row.x);

				text = tplProcess(tpl[0], {
					CLASS_TOOLTIP: CLASS.tooltip,
					TITLE: isValue(title) ? (
						tplStr ? title : `<tr><th colspan="2">${title}</th></tr>`
					) : ""
				});
			}

			param = [row.ratio, row.id, row.index, d];
			value = sanitise(valueFormat(getRowValue(row), ...param));

			if ($$.isAreaRangeType(row)) {
				const [high, low] = ["high", "low"].map(v => sanitise(
					valueFormat($$.getAreaRangeData(row, v), ...param)
				));

				value = `<b>Mid:</b> ${value} <b>High:</b> ${high} <b>Low:</b> ${low}`;
			}

			if (value !== undefined) {
				// Skip elements when their name is set to null
				if (row.name === null) {
					continue;
				}

				const name = sanitise(nameFormat(row.name, ...param));
				const color = getBgColor(row);
				const contentValue = {
					CLASS_TOOLTIP_NAME: CLASS.tooltipName + $$.getTargetSelectorSuffix(row.id),
					COLOR: tplStr ? color : (
						$$.patterns ? `<svg><rect style="fill:${color}" width="10" height="10"></rect></svg>` :
							`<span style="background-color:${color}"></span>`),
					"NAME": name,
					VALUE: value
				};

				if (tplStr && isObject(contents.text)) {
					Object.keys(contents.text).forEach(key => {
						contentValue[key] = contents.text[key][i];
					});
				}

				text += tplProcess(tpl[1], contentValue);
			}
		}

		return `${text}</table>`;
	},

	/**
	 * Get the content template string
	 * @param {String} tplStr
	 * @return {String} Template string
	 * @private
	 */
	getTooltipContentTemplate(tplStr) {
		return (tplStr || `<table class="{=CLASS_TOOLTIP}"><tbody>
				{=TITLE}
				{{<tr class="{=CLASS_TOOLTIP_NAME}">
					<td class="name">{=COLOR}{=NAME}</td>
					<td class="value">{=VALUE}</td>
				</tr>}}
			</tbody></table>`)
			.replace(/(\r?\n|\t)/g, "")
			.split(/{{(.*)}}/);
	},

	/**
	 * Returns the position of the tooltip
	 * @param {Object} dataToShow data
	 * @param {String} tWidth Width value of tooltip element
	 * @param {String} tHeight Height value of tooltip element
	 * @param {HTMLElement} element
	 * @returns {Object} top, left value
	 * @private
	 */
	tooltipPosition(dataToShow, tWidth, tHeight, element) {
		const $$ = this;
		const config = $$.config;
		let [left, top] = d3Mouse(element);

		const svgLeft = $$.getSvgLeft(true);
		let chartRight = svgLeft + $$.currentWidth - $$.getCurrentPaddingRight();

		top += 20;

		// Determine tooltip position
		if ($$.hasArcType()) {
			const raw = $$.inputType === "touch" || $$.hasType("radar");

			if (!raw) {
				top += $$.height / 2;
				left += ($$.width - ($$.isLegendRight ? $$.getLegendWidth() : 0)) / 2;
			}
		} else {
			const dataScale = $$.x(dataToShow[0].x);

			if (config.axis_rotated) {
				top = dataScale + 20;
				left += svgLeft + 100;
				chartRight -= svgLeft;
			} else {
				top -= 5;
				left = svgLeft + $$.getCurrentPaddingLeft(true) + 20 + ($$.zoomScale ? left : dataScale);
			}
		}

		const right = left + tWidth;

		if (right > chartRight) {
			// 20 is needed for Firefox to keep tooltip width
			left -= right - chartRight + 20;
		}

		if (top + tHeight > $$.currentHeight) {
			top -= tHeight + 30;
		}

		if (top < 0) {
			top = 0;
		}

		return {top, left};
	},

	/**
	 * Show the tooltip
	 * @private
	 * @param {Object} selectedData
	 * @param {HTMLElement} element
	 */
	showTooltip(selectedData, element) {
		const $$ = this;
		const config = $$.config;
		const bindto = config.tooltip_contents.bindto;
		const forArc = $$.hasArcType(null, ["radar"]);
		const dataToShow = selectedData.filter(d => d && isValue($$.getBaseValue(d)));
		const positionFunction = config.tooltip_position || $$.tooltipPosition;

		if (dataToShow.length === 0 || !config.tooltip_show) {
			return;
		}

		const datum = $$.tooltip.datum();
		const dataStr = JSON.stringify(selectedData);
		let width = (datum && datum.width) || 0;
		let height = (datum && datum.height) || 0;

		if (!datum || datum.current !== dataStr) {
			const index = selectedData.concat().sort()[0].index;

			callFn(config.tooltip_onshow, $$);

			// set tooltip content
			$$.tooltip
				.html($$.getTooltipHTML(
					selectedData,
					$$.axis.getXAxisTickFormat(),
					$$.getYFormat(forArc),
					$$.color
				))
				.style("display", config.tooltip_doNotHide === false ? "block" : null)
				.datum({
					index,
					current: dataStr,
					width: width = $$.tooltip.property("offsetWidth"),
					height: height = $$.tooltip.property("offsetHeight")
				});

			callFn(config.tooltip_onshown, $$);
			$$._handleLinkedCharts(true, index);
		}

		if (!bindto) {
			// Get tooltip dimensions
			const position = positionFunction.call(this, dataToShow, width, height, element);

			// Set tooltip position
			$$.tooltip
				.style("top", `${position.top}px`)
				.style("left", `${position.left}px`);
		}
	},

	/**
	 * Hide the tooltip
	 * @param {Boolean} force Force to hide
	 * @private
	 */
	hideTooltip(force) {
		const $$ = this;
		const config = $$.config;

		if (!config.tooltip_doNotHide || force) {
			callFn(config.tooltip_onhide, $$);

			// hide tooltip
			this.tooltip.style("display", "none").datum(null);

			callFn(config.tooltip_onhidden, $$);
		}
	},

	/**
	 * Toggle display for linked chart instances
	 * @param {Boolean} show true: show, false: hide
	 * @param {Number} index x Axis index
	 * @private
	 */
	_handleLinkedCharts(show, index) {
		const $$ = this;

		if ($$.config.tooltip_linked) {
			const linkedName = $$.config.tooltip_linked_name;

			($$.api.internal.charts || []).forEach(c => {
				if (c !== $$.api) {
					const config = c.internal.config;
					const isLinked = config.tooltip_linked;
					const name = config.tooltip_linked_name;
					const isInDom = document.body.contains(c.element);

					if (isLinked && linkedName === name && isInDom) {
						const data = c.internal.tooltip.data()[0];
						const isNotSameIndex = index !== (data && data.index);

						// prevent throwing error for non-paired linked indexes
						try {
							if (show && isNotSameIndex) {
								c.tooltip.show({index});
							} else if (!show) {
								c.tooltip.hide();
							}
						} catch (e) {}
					}
				}
			});
		}
	}
});
