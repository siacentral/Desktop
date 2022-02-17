import log from 'electron-log';
import { BigNumber } from 'bignumber.js';

import { getAverageSettings, getHost, getConnectability } from '@/api/siacentral';
import Store from '@/store';

export async function refreshExplorer() {
	try {
		await loadAverageSettings();
		await loadExplorerHost();
		await checkHostConnectability();
	} catch (ex) {
		log.error('refreshExplorer', ex.message);
	}
}

function severityToNumeric(severity) {
	switch (severity.toLowerCase()) {
	case 'severe':
		return 3;
	case 'warning':
		return 2;
	default:
		return 1;
	}
}

function translateSeverity(severity) {
	switch (severity.toLowerCase()) {
	case 'severe':
		return 'danger';
	case 'warning':
		return 'warning';
	default:
		return null;
	}
}

export async function checkHostConnectability() {
	try {
		if (!Store.state.netaddress)
			return;

		const report = await getConnectability(Store.state.netAddress);

		if (!report)
			return;

		const alerts = [];

		if (Array.isArray(report.errors) && report.errors.length !== 0) {
			let highestSeverityIdx;
			let highestSeverity;

			for (let i = 0; i < report.errors.length; i++) {
				const severity = severityToNumeric(report.errors[i].severity);

				if (!highestSeverityIdx || severity > highestSeverityIdx) {
					highestSeverityIdx = severity;
					highestSeverity = report.errors[i].severity;
				}

				alerts.push({
					category: 'connection',
					icon: 'wifi',
					severity: translateSeverity(report.errors[i].severity),
					message: report.errors[i].message
				});
			}

			report.severity = highestSeverity;
		}

		Store.dispatch('explorer/setAlerts', alerts);
		Store.dispatch('explorer/setConnectionReport', report);
	} catch (ex) {
		log.error('checkHostConnectability', ex.message);
	}
}

async function loadExplorerHost() {
	try {
		const publicHost = await getHost(Store.state.netAddress);
		if (!publicHost)
			return;

		if (publicHost.settings) {
			publicHost.settings = {
				netaddress: publicHost.settings.netaddress,
				version: publicHost.settings.version,
				accepting_contracts: publicHost.settings.accepting_contracts,
				max_download_batch_size: publicHost.settings.max_download_batch_size,
				max_duration: publicHost.settings.max_duration,
				max_revise_batch_size: publicHost.settings.max_revise_batch_size,
				remaining_storage: publicHost.settings.remaining_storage,
				sector_size: publicHost.settings.sector_size,
				total_storage: publicHost.settings.total_storage,
				window_size: publicHost.settings.window_size,
				revision_number: publicHost.settings.revision_number,
				base_rpc_price: new BigNumber(publicHost.settings.base_rpc_price),
				collateral: new BigNumber(publicHost.settings.collateral),
				max_collateral: new BigNumber(publicHost.settings.max_collateral),
				contract_price: new BigNumber(publicHost.settings.contract_price),
				download_price: new BigNumber(publicHost.settings.download_price),
				sector_access_price: new BigNumber(publicHost.settings.sector_access_price),
				storage_price: new BigNumber(publicHost.settings.storage_price),
				upload_price: new BigNumber(publicHost.settings.upload_price)
			};
		}

		Store.dispatch('explorer/setHost', publicHost);
	} catch (ex) {
		log.error('loadExplorerHost', ex.message);
	}
}

async function loadAverageSettings() {
	try {
		const averageSettings = await getAverageSettings();

		const settings = {
			max_duration: averageSettings.max_duration,
			window_size: averageSettings.window_size,
			max_revise_batch_size: new BigNumber(averageSettings.max_revise_batch_size),
			max_download_batch_size: new BigNumber(averageSettings.max_download_batch_size),
			contract_price: new BigNumber(averageSettings.contract_price),
			download_price: new BigNumber(averageSettings.download_price),
			upload_price: new BigNumber(averageSettings.upload_price),
			storage_price: new BigNumber(averageSettings.storage_price),
			collateral: new BigNumber(averageSettings.collateral),
			max_collateral: new BigNumber(averageSettings.max_collateral),
			base_rpc_price: new BigNumber(averageSettings.base_rpc_price),
			sector_access_price: new BigNumber(averageSettings.sector_access_price)
		};

		Store.dispatch('explorer/setAverageSettings', settings);
	} catch (ex) {
		log.error('loadAverageSettings', ex.message);
	}
}