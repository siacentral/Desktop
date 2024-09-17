<template>
	<transition name="slide-left" appear>
	<div class="filter-wrapper" @mousedown.self="$emit('close')">
			<div class="panel panel-filter">
				<a href="#" class="close-button" @click.prevent="$emit('close')"><icon icon="times" /></a>
				<div class="filter-contents">
					<label class="filter-header">Contract Status</label>
					<div class="control control-inline">
						<input type="checkbox" id="chk-contracts-filter-active" v-model="active" />
						<label for="chk-contracts-filter-active">Active</label>
					</div>
					<div class="control control-inline">
						<input type="checkbox" id="chk-contracts-filter-successful" v-model="successful" />
						<label for="chk-contracts-filter-successful">Successful</label>
					</div>
					<div class="control control-inline">
						<input type="checkbox" id="chk-contracts-filter-failed" v-model="failed" />
						<label for="chk-contracts-filter-failed">Failed</label>
					</div>
					<label class="filter-header">Expiration Date</label>
					<div class="filter-presets">
						<button class="btn btn-inline" @click="setDatePreset('today')">Today</button>
						<button class="btn btn-inline" @click="setDatePreset('week')">This Week</button>
						<button class="btn btn-inline" @click="setDatePreset('month')">This Month</button>
						<button class="btn btn-inline" @click="setDatePreset('year')">This Year</button>
					</div>
					<div class="control control-split">
						<input type="date" v-model="startDateStr" />
						<div>-</div>
						<input type="date" v-model="endDateStr" />
						<label class="error" v-if="errors['date']">{{ errors['date'] }}</label>
					</div>
					<label class="filter-header">Revenue</label>
					<div class="control control-split">
						<input type="text" v-model="revenueMinStr" />
						<div>-</div>
						<input type="text" v-model="revenueMaxStr" />
						<label class="error" v-if="errors['revenue']">{{ errors['revenue'] }}</label>
					</div>
				</div>
				<div class="filter-content visible-columns">
					<label class="filter-header">Visible Columns</label>
					<div class="column-select-columns">
						<div class="control" v-for="column in columns" :key="column.key">
							<input ref="columns" type="checkbox" :column="column.key" :id="`chk-show-${column.key}`" @change="onChangeColVisible" />
							<label :for="`chk-show-${column.key}`">{{ column.text }}</label>
						</div>
					</div>
				</div>
			</div>
		</div>
	</transition>
</template>

<script>
import log from 'electron-log';

import { parseCurrencyString } from '@/utils/parseLegacy';
import { formatPriceString } from '@/utils/formatLegacy';

export default {
	props: {
		columns: Array,
		filter: Object,
		visible: Array
	},
	data() {
		return {
			errors: {},
			active: false,
			successful: false,
			failed: false,
			startDateStr: null,
			endDateStr: null,
			startDate: null,
			endDate: null,
			revenueMinStr: null,
			revenueMaxStr: null,
			revenueMin: null,
			revenueMax: null
		};
	},
	beforeMount() {
		this.loadFilter();
	},
	mounted() {
		for (let i = 0; i < this.$refs.columns.length; i++) {
			const chk = this.$refs.columns[i],
				key = chk.getAttribute('column');

			chk.checked = this.visible.indexOf(key) !== -1;
		}
	},
	methods: {
		onChangeColVisible() {
			try {
				const visible = [];

				for (let i = 0; i < this.$refs.columns.length; i++) {
					const chk = this.$refs.columns[i];

					if (chk.checked)
						visible.push(chk.getAttribute('column'));
				}

				this.$emit('shown', visible);
			} catch (ex) {
				log.error('onChangeColVisible', ex.message);
			}
		},
		loadFilter() {
			this.active = Array.isArray(this.filter.statuses) && this.filter.statuses.indexOf('active') !== -1;
			this.successful = Array.isArray(this.filter.statuses) && this.filter.statuses.indexOf('successful') !== -1;
			this.failed = Array.isArray(this.filter.statuses) && this.filter.statuses.indexOf('failed') !== -1;

			if (this.filter.start_date)
				this.startDateStr = this.dateControlFormat(this.filter.start_date);

			if (this.filter.end_date)
				this.endDateStr = this.dateControlFormat(this.filter.end_date);

			if (this.filter.revenue_min)
				this.revenueMinStr = formatPriceString(this.filter.revenue_min, 4);

			if (this.filter.revenue_max)
				this.revenueMaxStr = formatPriceString(this.filter.revenue_max, 4);
		},
		buildFilter() {
			try {
				const filter = {},
					statuses = [];

				if (this.active)
					statuses.push('active');

				if (this.unused)
					statuses.push('unused');

				if (this.successful)
					statuses.push('successful');

				if (this.failed)
					statuses.push('failed');

				filter.statuses = statuses;

				if (this.startDate)
					filter.start_date = this.startDate;

				if (this.endDate)
					filter.end_date = this.endDate;

				if (this.revenueMin)
					filter.revenue_min = this.revenueMin;

				if (this.revenueMax)
					filter.revenue_max = this.revenueMax;

				this.$emit('filtered', filter);
			} catch (ex) {
				log.error('onBuildFilter', ex.message);
			}
		},
		setDatePreset(preset) {
			const start = new Date(),
				end = new Date();

			switch (preset) {
			case 'year':
				start.setMonth(0, 1);
				start.setHours(0, 0, 0, 0);
				end.setFullYear(start.getFullYear() + 1, 0, 1);
				end.setHours(0, 0, 0, -1);
				break;
			case 'month':
				start.setDate(1);
				start.setHours(0, 0, 0, 0);
				end.setMonth(start.getMonth() + 1, 0);
				end.setHours(23, 59, 59, 999);

				break;
			case 'week': {
				const curr = start.getDay(),
					diffB = start.getDate() - curr + (curr === 0 ? -6 : 1),
					diffE = start.getDate() + 6 - (curr === 0 ? 7 : curr);

				start.setDate(diffB);
				start.setHours(0, 0, 0, 0);
				end.setDate(diffE);
				end.setHours(23, 59, 59, 999);

				break;
			} default:
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);

				break;
			}

			this.startDate = start;
			this.endDate = end;
			this.startDateStr = this.dateControlFormat(start);
			this.endDateStr = this.dateControlFormat(end);
		},
		dateControlFormat(date) {
			const month = (date.getMonth() + 1).toString().padStart(2, '0'),
				day = date.getDate().toString().padStart(2, '0');

			return `${date.getFullYear()}-${month}-${day}`;
		}
	},
	watch: {
		active() {
			this.buildFilter();
		},
		unused() {
			this.buildFilter();
		},
		successful() {
			this.buildFilter();
		},
		failed() {
			this.buildFilter();
		},
		startDateStr(val) {
			if (val === null || typeof val !== 'string' || val.length === 0) {
				this.startDate = null;
				this.buildFilter();
				return;
			}

			this.startDate = null;

			const time = Date.parse(val);

			if (isNaN(time))
				return;

			this.startDate = new Date(time);
			this.startDate.setHours(0, 0, 0, 0);

			if (this.startDate && this.endDate && this.startDate > this.endDate) {
				this.errors.date = 'Start date must be after end date';
				return;
			}

			this.errors.date = null;
			this.buildFilter();
		},
		endDateStr(val) {
			if (val === null || typeof val !== 'string' || val.length === 0) {
				this.endDate = null;
				this.buildFilter();
				return;
			}

			this.endDate = null;

			const time = Date.parse(val);

			if (isNaN(time))
				return;

			this.endDate = new Date(time);
			this.endDate.setHours(23, 59, 59, 999);

			if (this.startDate && this.endDate && this.startDate > this.endDate) {
				this.errors.date = 'Start date must be after end date';
				return;
			}

			this.errors.date = null;
			this.buildFilter();
		},
		revenueMinStr(val) {
			try {
				if (val === null || typeof val !== 'string' || val.length === 0) {
					this.revenueMin = null;
					this.buildFilter();
					return;
				}

				this.revenueMin = parseCurrencyString(val);
				this.errors.revenue = null;

				this.buildFilter();
			} catch (ex) {
				this.errors.revenue = ex.message;
			}
		},
		revenueMaxStr(val) {
			try {
				if (val === null || typeof val !== 'string' || val.length === 0) {
					this.revenueMax = null;
					this.buildFilter();
					return;
				}

				this.revenueMax = parseCurrencyString(val);
				this.errors.revenue = null;

				this.buildFilter();
			} catch (ex) {
				this.errors.revenue = ex.message;
			}
		}
	}
};
</script>

<style lang="stylus" scoped>
.filter-wrapper {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom:0;
	z-index: 1001;
}

.panel.panel-filter {
	position: absolute;
	display: grid;
	top: 0;
	right: 0;
	bottom: 0;
	grid-template-rows: auto minmax(0, 1fr);
	width: auto;
	padding: 45px 15px 15px;
	background-color: bg-dark-accent;
	box-shadow: -2px 0px 5px rgba(0, 0, 0, 0.22);

	.close-button {
		position: absolute;
		display: inline-block;
		top: 15px;
		right: 15px;
		color: rgba(255, 255, 255, 0.54);
		text-decoration: none;
		cursor: pointer;
		transition: color 0.3s ease;

		&:hover, &:active, &:focus {
			color: primary;
		}
	}
}

body.win32 {
	.filter-wrapper {
		padding: 32px 0 15px;
	}

	.panel.panel-filter .close-button {
		top: 45px;
	}
}

.filter-header {
	position: sticky;
	display: block;
	top: 0;
	font-size: 1rem;
	background: bg-dark-accent;
	color: rgba(255, 255, 255, 0.54);
	padding: 10px 0;
	z-index: 2;
}

.filter-presets {
	margin-bottom: 10px;

	.btn {
		font-size: 0.9rem;
		padding: 5px 8px;
		margin: 0 8px 10px 0;
	}
}

.control {
	&.control-inline {
		margin-right: 15px;
	}

	&.control-split {
		display: grid;
		grid-gap: 5px;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
	}
}

.filter-content.visible-columns {
	height: 100%;
	overflow-x: hidden;
	overflow-y: auto;

	.control {
		text-align: left;
		margin-bottom: 15px;

		&:last-of-type {
			margin-bottom: 0;
		}
	}
}
</style>