import log from 'electron-log';
import { BigNumber } from 'bignumber.js';
import Decimal from 'decimal.js-light';

import { apiClient } from './index';
import Store from '@/store';

export async function refreshHostStorage() {
	try {
		await loadHostStorage();
	} catch (ex) {
		log.error('refreshHostStorage', ex.message);
	}
}

async function loadHostStorage() {
	const storage = await apiClient.getHostStorage(),
		storageAlerts = [];

	let usedStorage = new BigNumber(0),
		totalStorage = new BigNumber(0),
		successfulReads = 0,
		successfulWrites = 0,
		failedReads = 0,
		failedWrites = 0,
		readPct = 0, writePct = 0;

	const folders = (storage.folders || []).map(f => {
		let progress = 0;

		// this appears to only work on exceptionally slow add or resizes. Remove does not use this for whatever reason
		if (f.ProgressDenominator > 0)
			progress = new Decimal(f.ProgressNumerator).div(f.ProgressDenominator).toNumber();

		f = {
			path: f.path,
			index: f.index,
			total_capacity: new BigNumber(f.capacity),
			used_capacity: new BigNumber(f.capacity).minus(f.capacityremaining),
			free_capacity: new BigNumber(f.capacityremaining),
			successful_reads: f.successfulreads,
			successful_writes: f.successfulwrites,
			failed_reads: f.failedreads,
			failed_writes: f.failedwrites,
			progress
		};

		usedStorage = usedStorage.plus(f.used_capacity);
		totalStorage = totalStorage.plus(f.total_capacity);
		successfulReads += f.successful_reads;
		successfulWrites += f.successful_writes;
		failedReads += f.failed_reads;
		failedWrites += f.failed_writes;

		if (f.failed_reads === 9999999999 && f.failed_writes === 9999999999) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: `'${f.path}' is inaccessible. This can cause data corruption and revenue loss. Check your folder path and permissions.`
			});
		} else if (f.failed_reads > 0 && f.failed_writes > 0) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: `'${f.path}' has read and write errors. This can cause data corruption and revenue loss`
			});
		} else if (f.failed_reads > 0) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: `'${f.path}' has ${f.failed_reads > 1 ? f.failed_reads + ' failed reads' : 'a failed read'}. This can cause data corruption and revenue loss`
			});
		} else if (f.failed_writes > 0) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: `'${f.path}' has ${f.failed_writes > 1 ? f.failed_writes + ' failed writes' : 'a failed write'}. This can cause data corruption and revenue loss`
			});
		}

		return f;
	});

	if (totalStorage.gt(0)) {
		const usedPct = usedStorage.div(totalStorage);

		if (usedPct.gte(1)) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: 'All of your available storage is utilized no more contracts will form.'
			});
		} else if (usedPct.gt(0.9)) {
			storageAlerts.push({
				category: 'storage',
				severity: 'danger',
				icon: 'hdd',
				message: 'More than 90% of available storage has been used. You should add more storage soon.'
			});
		} else if (usedPct.gt(0.75)) {
			storageAlerts.push({
				category: 'storage',
				severity: 'warning',
				icon: 'hdd',
				message: 'More than 75% of available storage has been used. You should add more storage soon.'
			});
		}
	} else {
		storageAlerts.push({
			category: 'storage',
			severity: 'warning',
			icon: 'hdd',
			message: 'No storage has been added. Add storage to start hosting'
		});
	}

	if (successfulReads + failedReads > 0)
		readPct = failedReads / (successfulReads + failedReads);

	if (successfulWrites + failedWrites > 0)
		writePct = failedWrites / (successfulWrites + failedWrites);

	const addAlerts = (await syncHostAlerts()) || [];
	storageAlerts.push(...addAlerts);

	// deep copy here
	Store.dispatch('hostStorage/setFolders', JSON.parse(JSON.stringify(folders)));
	Store.dispatch('hostStorage/setUsedStorage', usedStorage);
	Store.dispatch('hostStorage/setTotalStorage', totalStorage);
	Store.dispatch('hostStorage/setReadPercent', readPct);
	Store.dispatch('hostStorage/setWritePercent', writePct);
	Store.dispatch('hostStorage/setAlerts', storageAlerts);
}

function convertAlert(siaAlert) {
	const alert = {
		message: siaAlert.msg,
		icon: 'info'
	};

	switch (siaAlert.severity.toLowerCase()) {
	case 'info':
		alert.severity = 'info';
		break;
	case 'warning':
		alert.severity = 'warning';
		break;
	case 'error', 'critical':
		alert.severity = 'danger';
		break;
	}

	if (siaAlert.cause === 'folder op') {
		alert.category = 'storage';
		alert.icon = 'folder';
	}

	return alert;
}

async function syncHostAlerts() {
	try {
		let { alerts } = await apiClient.getAlerts(Store.state.netAddress);
		if (!Array.isArray(alerts))
			alerts = [];

		return alerts.map(convertAlert);
	} catch (ex) {
		log.error('syncHostAlerts', ex);
	}
}